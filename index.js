#!/usr/bin/env node

const cookies = process.env.COOKIE?.split('\n').map(s => s.trim()) || []
const games = process.env.GAMES?.split('\n').map(s => s.trim()) || []
const akCreds = process.env.AK_CREDS?.split('\n').map(s => s.trim()) || []
const akCookies = process.env.AK_COOKIES?.split('\n').map(s => s.trim()) || []
const akRoles = process.env.AK_ROLES?.split('\n').map(s => s.trim()) || []
const discordWebhook = process.env.DISCORD_WEBHOOK
const discordUser = process.env.DISCORD_USER

const msgDelimiter = ':'
const messages = []

const HOYO_ENDPOINTS = {
  zzz: 'https://sg-act-nap-api.hoyolab.com/event/luna/zzz/os/sign?act_id=e202406031448091',
  gi: 'https://sg-hk4e-api.hoyolab.com/event/sol/sign?act_id=e202102251931481',
  hsr: 'https://sg-public-api.hoyolab.com/event/luna/os/sign?act_id=e202303301540311',
  hi3: 'https://sg-public-api.hoyolab.com/event/mani/sign?act_id=e202110291205111',
  tot: 'https://sg-public-api.hoyolab.com/event/luna/os/sign?act_id=e202202281857121',
}

const AK_ENDPOINT = 'https://zonai.skport.com/web/v1/game/endfield/attendance'

let hasErrors = false
let latestGames = []

async function runHoyoGames(cookie, games) {
  if (!games) {
    games = latestGames
  } else {
    games = games.split(' ')
    latestGames = games
  }

  for (let game of games) {
    game = game.toLowerCase()

    log('debug', `\n----- CHECKING IN FOR ${game.toUpperCase()} -----`)

    if (!(game in HOYO_ENDPOINTS)) {
      log('error', `Game ${game} is invalid. Available games are: zzz, gi, hsr, hi3, and tot`)
      continue
    }

    const endpoint = HOYO_ENDPOINTS[game]
    const url = new URL(endpoint)
    const actId = url.searchParams.get('act_id')

    url.searchParams.set('lang', 'en-us')

    const body = JSON.stringify({
      lang: 'en-us',
      act_id: actId
    })

    const headers = new Headers({
      'accept': 'application/json, text/plain, */*',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'accept-language': 'en-US,en;q=0.6',
      'connection': 'keep-alive',
      'origin': 'https://act.hoyolab.com',
      'referer': 'https://act.hoyolab.com',
      'content-type': 'application/json;charset=UTF-8',
      'cookie': cookie,
      'sec-ch-ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Brave";v="126"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'sec-gpc': '1',
      'x-rpc-signgame': game,
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    })

    const res = await fetch(url, { method: 'POST', headers, body })
    const json = await res.json()
    const code = String(json.retcode)

    const successCodes = {
      '0': 'Successfully checked in!',
      '-5003': 'Already checked in for today',
    }

    if (code in successCodes) {
      log('info', game, successCodes[code])
      continue
    }

    const errorCodes = {
      '-100': 'Error not logged in. Your cookie is invalid, try setting up again',
      '-10002': 'Error not found. You haven\'t played this game'
    }

    log('debug', game, 'Headers', Object.fromEntries(res.headers))
    log('debug', game, 'Response', json)

    if (code in errorCodes) {
      log('error', game, errorCodes[code])
      continue
    }

    log('error', game, 'Error undocumented, report to Issues page if this persists')
  }
}

async function runArknightsEndfield(cred, cookie, role) {
  log('debug', '\n----- CHECKING IN FOR ARKNIGHTS ENDFIELD -----')

  const headers = new Headers({
    'accept': '*/*',
    'accept-encoding': 'gzip, deflate, br, zstd',
    'accept-language': 'en-US,en;q=0.5',
    'connection': 'keep-alive',
    'origin': 'https://game.skport.com',
    'referer': 'https://game.skport.com/',
    'content-type': 'application/json',
    'sk-language': 'en',
    'sk-game-role': role,
    'cred': cred,
    'cookie': cookie,
    'sec-gpc': '1',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:146.0) Gecko/20100101 Firefox/146.0'
  })

  const res = await fetch(AK_ENDPOINT, { method: 'POST', headers })
  const json = await res.json()

  log('debug', 'akef', 'Response', json)

  // Handle response based on actual API response structure
  if (json.code === 0 || json.code === '0') {
    log('info', 'akef', 'Successfully checked in!')
  } else if (json.msg && json.msg.includes('signed')) {
    log('info', 'akef', 'Already checked in for today')
  } else if (json.code === -1 || json.code === '-1') {
    log('error', 'akef', `Error: ${json.msg || 'Authentication failed. Check your credentials'}`)
  } else {
    log('error', 'akef', `Error: ${json.msg || 'Undocumented error, report to Issues page if this persists'}`)
  }
}

// custom log function to store messages
function log(type, ...data) {
  console[type](...data)

  // ignore debug and toggle hasErrors
  switch (type) {
    case 'debug': return
    case 'error': hasErrors = true
  }

  // check if it's a game specific message, and set it as uppercase for clarity, and add delimiter
  const allGames = { ...HOYO_ENDPOINTS, akef: true }
  if (data[0] in allGames) {
    data[0] = data[0].toUpperCase() + msgDelimiter
  }

  // serialize data and add to messages
  const string = data
    .map(value => {
      if (typeof value === 'object') {
        return JSON.stringify(value, null, 2).replace(/^"|"$/, '')
      }
      return value
    })
    .join(' ')

  messages.push({ type, string })
}

// must be function to return early
async function discordWebhookSend() {
  log('debug', '\n----- DISCORD WEBHOOK -----')

  if (!discordWebhook?.toLowerCase().trim().startsWith('https://discord.com/api/webhooks/')) {
    log('error', 'DISCORD_WEBHOOK is not a Discord webhook URL. Must start with `https://discord.com/api/webhooks/`')
    return
  }

  let discordMsg = discordUser ? `<@${discordUser}>\n` : ''
  discordMsg += messages.map(msg => `(${msg.type.toUpperCase()}) ${msg.string}`).join('\n')

  const res = await fetch(discordWebhook, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      content: discordMsg
    })
  })

  if (res.status === 204) {
    log('info', 'Successfully sent message to Discord webhook!')
    return
  }

  log('error', 'Error sending message to Discord webhook, please check URL and permissions')
}

// Main execution
if (!cookies.length && !akCreds.length) {
  throw new Error('No credentials set! Please set COOKIE for HoYo games or AK_CREDS for Arknights Endfield')
}

// Process HoYo games
if (cookies.length && games.length) {
  for (const index in cookies) {
    log('info', `-- CHECKING IN HOYO GAMES FOR ACCOUNT ${Number(index) + 1} --`)
    await runHoyoGames(cookies[index], games[index])
  }
}

// Process Arknights Endfield
if (akCreds.length) {
  for (const index in akCreds) {
    const cred = akCreds[index]
    const cookie = akCookies[index] || ''
    const role = akRoles[index] || ''

    if (!cred) {
      log('error', 'akef', 'Missing AK_CREDS for account')
      continue
    }

    if (!role) {
      log('error', 'akef', 'Missing AK_ROLES for account')
      continue
    }

    log('info', `-- CHECKING IN ARKNIGHTS ENDFIELD FOR ACCOUNT ${Number(index) + 1} --`)
    await runArknightsEndfield(cred, cookie, role)
  }
}

if (discordWebhook && URL.canParse(discordWebhook)) {
  await discordWebhookSend()
}

if (hasErrors) {
  console.log('')
  throw new Error('Error(s) occurred.')
}
