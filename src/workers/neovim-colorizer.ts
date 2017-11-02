import { is, log, prefixWith, onFnCall, pascalCase, delay } from '../utils'
import CreateTransport from '../transport'
import { Api, Prefixes } from '../api'
import Neovim from '@veonim/neovim'
import SetupRPC from '../rpc'

interface ColorData {
  color: string,
  text: string,
}

const prefix = { core: prefixWith(Prefixes.Core) }

const asVimFunc = (name: string, fn: string) => {
  const expr = fn
    .split('\n')
    .filter(m => m)
    .join('\\n')
    .replace(/"/g, '\\"')

  return `exe ":fun! ${pascalCase(name)}(...) range\n${expr}\nendfun"`
}

const { encoder, decoder } = CreateTransport()
const proc = Neovim([
  '--cmd', `let g:veonim = 1 | let g:vn_loaded = 0 | let g:vn_ask_cd=0`,
  '--cmd', `exe ":fun! Veonim(...)\\n endfun"`,
  '--cmd', `com! -nargs=+ -range Veonim 1`,
  '--cmd', 'com! -nargs=* Plug 1',
  '--embed',
])

proc.on('error', e => log `vim colorizer err ${e}`)
proc.stdout.on('error', e => log `vim colorizer stdout err ${(JSON.stringify(e))}`)
proc.stdin.on('error', e => log `vim colorizer stdin err ${(JSON.stringify(e))}`)
proc.stderr.on('data', e => console.error('ayy', e))
proc.on('exit', () => log `vim colorizer exit`)

encoder.pipe(proc.stdin)
proc.stdout.pipe(decoder)

const { notify, request, onData } = SetupRPC(encoder.write)
decoder.on('data', ([type, ...d]: [number, any]) => onData(type, d))

const req: Api = onFnCall((name: string, args: any[] = []) => request(prefix.core(name), args))
const api: Api = onFnCall((name: string, args: any[]) => notify(prefix.core(name), args))

let attempts = 0
const unblock = (): Promise<string[]> => new Promise(fin => {
  let neverGonnaGiveYouUp = false

  const timer = setTimeout(() => {
    neverGonnaGiveYouUp = true // never gonna let you down
    fin([])
  }, 2e3)

  const tryToUnblock = () => req.getMode().then(mode => {
    if (!mode.blocking) {
      Promise.race([
        req.commandOutput('messages').then(m => m.split('\n').filter(m => m)),
        delay(250).then(() => [])
      ]).then(fin)

      clearInterval(timer)
      return
    }

    attempts += 1
    api.input(`<Enter>`)
    if (!neverGonnaGiveYouUp) setImmediate(() => tryToUnblock())
  })

  tryToUnblock()
})

unblock().then(errors => {
  if (errors.length) {
    console.error(`vim colorizer had some errors starting up`)
    errors.forEach(e => console.error(e))
    console.log('attempts made:', attempts)
  }

  // TODO: main veonim instance will install plugins...
  // so there could be a race condition where this instance starts up
  // but the plugins are not done installing...
  //
  // would need somehow to broadcast install completion status to this instance
  // or, only start colorizer until plugins have installed (in new Worker() client)

  // TODO: are plugins being loaded? (syntax for typescript needed via plugin)
  // test by setting ft=java so we should get some colors back...
  const vimOptions = {
    rgb: true,
    ext_popupmenu: false,
    ext_tabline: false,
    ext_wildmenu: false,
    ext_cmdline: false
  }

  api.uiAttach(100, 10, vimOptions)
  console.log('loaded!')
})

api.command(asVimFunc('Colorize', `
  execute 'set filetype=' . a:1

  let lineColors = []
  let lines = getline(1, '$')
  let lineCount = len(lines)
  let lineIx = 0

  while lineIx < lineCount
    let line = lines[lineIx]
    let colors = []
    let chars = split(line, '\\\\zs')
    let strLen = len(chars)
    let col = 1

    while col <= strLen
      let clr = synIDattr(synIDtrans(synID(lineIx + 1, col, 1)), 'fg#')
      call add(colors, [col, clr])
      let col += 1
    endwhile

    call add(lineColors, colors)
    let lineIx += 1
  endwhile

  return lineColors
`))

const insertIntoBuffer = (lines: string[]) => {
  api.command(`bd!`)
  api.callFunction('append', [0, lines])
}

type Color = [number, string]
const getTextColors = (filetype = ''): Promise<Color[][]> => req.callFunction('Colorize', [filetype])

type ColorRange = [number, number, string]
const colorsAsRanges = (colors: Color[][]): ColorRange[][] => colors.map(line => line.reduce((grp, [col, color]) => {
  if (col === 1) return (grp.push([0, col, color]), grp)

  const prev = grp[grp.length - 1]
  if (prev[2] === color) prev[1] = col
  else grp.push([col - 1, col, color])

  return grp
}, [] as ColorRange[]))


const colorData = (lines: string[], ranges: ColorRange[][]): ColorData[][] => ranges.map((line, ix) => line
  .map(([ s, e, color ]) => ({
    color,
    text: lines[ix].slice(s, e),
  })))

// TODO: probably need some mechanism to queue requests and do them serially.
// don't want to override vim buffer while another req is processing
const colorizeText = async (text: string, filetype = ''): Promise<ColorData[][]> => {
  // TODO: the setColorScheme fn below does not set correct color?
  // this second time works here
  //const clr = await req.commandOutput(`colorscheme`).catch(console.error)
  const lines = text.split('\n')
  insertIntoBuffer(lines)

  console.time('COLORIZE')
  const colors = await getTextColors(filetype) || []
  console.timeEnd('COLORIZE')
  console.log('actual colors:', colors[0].length)
  const res = (colors[0] || []).map(m => m[1])
  console.log('SHOW ME THE MONEY:', res)

  return colorData(lines, colorsAsRanges(colors))
}

// TODO: the setColorScheme fn below does not set correct color?
// TODO: colorscheme will be loaded at startup. not need to call this...
// HOWEVER, we need some way of detecting colorscheme changes by user to keep
// this instance in sync
//
// // use <amatch> in autocmd event
// look at autocmd: ColorScheme?
const setColorScheme = (scheme: string) => api.command(`colorscheme ${scheme}`)
// TODO: look at autocmd: FileType

onmessage = ({ data }: MessageEvent) => {
  if (!is.array(data)) return
  const [ method, args ] = data

  if (method === 'colorize' && is.array(args)) {
    const [ text, filetype ] = args
    colorizeText(text, filetype).then(res => postMessage([ 'colorized', res ]))
  }

  else if (method === 'set-colorscheme') setColorScheme(args)
}