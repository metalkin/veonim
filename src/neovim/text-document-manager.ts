import { EventEmitter } from 'events'
import nvim from '../core/neovim'

type DocumentCallback = (documentName: string) => void

export default () => {
  const openDocuments = new Set<string>()
  const watchers = new EventEmitter()

  const checkIfDocumentOpened = async () => {
    const name = await nvim.current.buffer.name
    if (openDocuments.has(name)) return
    openDocuments.add(name)
    watchers.emit('didOpen', name)

    nvim.current.buffer.attach({ sendInitialBuffer: true }, changeEvent => {
      console.log('buffer changed:', name, changeEvent)
      watchers.emit('didChange', changeEvent.lineData)
    })
  }

  nvim.on.bufLoad(checkIfDocumentOpened)
  nvim.on.bufAdd(checkIfDocumentOpened)

  nvim.on.bufWritePre(async () => {
    const name = await nvim.current.buffer.name
    watchers.emit('willSave', name)
  })

  nvim.on.bufWrite(async () => {
    const name = await nvim.current.buffer.name
    watchers.emit('didSave', name)
  })

  const on = {
    didOpen: (fn: DocumentCallback) => watchers.on('didOpen', fn),
    // TODO: better change event types/data - including ranges, etc.
    didChange: (fn: (name: string, changes: string[]) => void) => watchers.on('didChange', fn),
    willSave: (fn: DocumentCallback) => watchers.on('willSave', fn),
    didSave: (fn: DocumentCallback) => watchers.on('didSave', fn),
    didClose: (fn: DocumentCallback) => watchers.on('didClose', fn),
  }

  return { on }
}
