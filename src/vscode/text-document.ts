import filetypeToVSCLanguage from '../langserv/vsc-languages'
import { Position, Range } from '../vscode/types'
import nvimSync from '../neovim/sync-api-client'
import { BufferOption } from '../neovim/types'
import TextLine from '../vscode/text-line'
import { is } from '../support/utils'
import { URI } from '../vscode/uri'
import * as vsc from 'vscode'

// TODO:
// - nvim write with bufdo works
// - write tests

export default (bufid: number): vsc.TextDocument => ({
  get isUntitled() {
    const name = nvimSync((nvim, id) => {
      return nvim.Buffer(id).name
    }).call(bufid)

    return !name
  },
  get uri() {
    const name = nvimSync((nvim, id) => {
      return nvim.Buffer(id).name
    }).call(bufid)

    return URI.file(name)
  },
  get fileName() {
    return nvimSync((nvim, id) => {
      return nvim.Buffer(id).name
    }).call(bufid)
  },
  get languageId() {
    const filetype: string = nvimSync((nvim, id) => {
      return nvim.Buffer(id).getOption(BufferOption.Filetype)
    }).call(bufid)

    return filetypeToVSCLanguage(filetype)
  },
  get version() {
    return nvimSync((nvim, id) => {
      return nvim.Buffer(id).changedtick
    }).call(bufid)
  },
  get isDirty() {
    return !!nvimSync((nvim, id) => {
      return nvim.Buffer(id).getOption(BufferOption.Modified)
    }).call(bufid)
  },
  get isClosed() {
    return !nvimSync((nvim, id) => nvim.Buffer(id).isLoaded()).call(bufid)
  },
  get lineCount() {
    return nvimSync((nvim, id) => {
      return nvim.Buffer(id).length
    }).call(bufid)
  },
  get eol() {
    const fileFormat = nvimSync((nvim, id) => {
      return nvim.Buffer(id).getOption(BufferOption.FileFormat)
    }).call(bufid)

    return fileFormat === 'dos'
      ? vsc.EndOfLine.CRLF
      : vsc.EndOfLine.LF
  },
  save: async () => {
    console.error('not possible in neovim to save a buffer in the background (when i wrote this)')
    return false
  },
  lineAt: (lineOrPosition: number | vsc.Position) => {
    const line = is.number(lineOrPosition)
      ? lineOrPosition as number
      : (lineOrPosition as vsc.Position).line

    const lineData = nvimSync((nvim, id, line) => {
      return nvim.Buffer(id).getLine(line)
    }).call(bufid, line)

    return TextLine(line, lineData)
  },
  offsetAt: position => {
    const offset: number = nvimSync((nvim, id, line) => {
      return nvim.Buffer(id).getOffset(line)
    }).call(bufid, position.line)

    return offset + position.character
  },
  positionAt: offset => {
    const lines = nvimSync((nvim, id) => nvim.Buffer(id).getAllLines()).call(bufid)
    const lineCount = lines.length
    let countingOffset = 0
    let lineNumber = -1
    let columnNumber = -1

    for (let ix = 0; ix < lineCount; ix++) {
      const lineContents = lines[ix]
      const nextOffset = countingOffset += lineContents.length

      if (offset >= countingOffset && offset <= nextOffset) {
        lineNumber = ix
        columnNumber = offset - nextOffset
        break
      }
      countingOffset += lineContents.length
    }

    return new Position(lineNumber, columnNumber)
  },
  getText: range => {
    if (!range) {
      const lines = nvimSync((nvim, id) => nvim.Buffer(id).getAllLines()).call(bufid)
      return lines.join('\n')
    }

    const lines = nvimSync((nvim, id, start, end) => {
      return nvim.Buffer(id).getLines(start, end)
    }).call(bufid, range.start.line, range.end.line)

    const selection = [
      lines[0].slice(range.start.character),
      ...lines.slice(1, -1),
      lines[lines.length - 1].slice(0, range.end.character),
    ]

    return selection.join('\n')
  },
  getWordRangeAtPosition: (position, regex) => {
    // TODO: NYI
    console.warn('NYI: getWordRangeAtPosition', position, regex)
  },
  // assumes given range starts a line:0, character: 0
  validateRange: range => {
    const lastLineText = nvimSync((nvim, id, line) => {
      return nvim.Buffer(id).getLine(line)
    }).call(bufid, range.end.line)

    if (!lastLineText) {
      const lineCount = nvimSync((nvim, id) => nvim.Buffer(id).length).call(bufid)
      const lastLine = nvimSync((nvim, id, line) => nvim.Buffer(id).getLine(line)).call(bufid)

      return new Range(
        new Position(range.start.line, range.start.character),
        new Position(lineCount, lastLine.length)
      )
    }

    if (lastLineText.length > range.end.character) return range

    return new Range(
      new Position(range.start.line, range.start.character),
      new Position(range.end.line, lastLineText.length),
    )
  },
  validatePosition: position => {
    const lastLineText = nvimSync((nvim, id, line) => {
      return nvim.Buffer(id).getLine(line)
    }).call(bufid, position.line)

    if (!lastLineText) {
      const lineCount = nvimSync((nvim, id) => nvim.Buffer(id).length).call(bufid)
      const lastLine = nvimSync((nvim, id, line) => nvim.Buffer(id).getLine(line)).call(bufid)
      return new Position(lineCount, lastLine.length)
    }

    if (lastLineText.length > position.character) return position

    return new Position(position.line, lastLineText.length)
  },
})
