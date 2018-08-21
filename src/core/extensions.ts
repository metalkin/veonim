import { DebugAdapterConnection } from '../messaging/debug-protocol'
import Worker from '../messaging/worker'

export interface RPCServer {
  sendNotification: (method: string, ...params: any[]) => void,
  sendRequest: (method: string, ...params: any[]) => Promise<any>,
  onNotification: (method: string, cb: (...args: any[]) => void) => void,
  onRequest: (method: string, cb: (...args: any[]) => Promise<any>) => void,
  onError: (cb: (err: any) => void) => void,
  onClose: (cb: (err: any) => void) => void,
}

export interface DebuggerInfo {
  label: string
  type: string
}

const { on, call, request } = Worker('extension-host')

// TODO: this does not need to be async right?
const bridgeServer = async (serverId: string): Promise<RPCServer> => {
  const sendNotification = (method: string, ...params: any[]) => {
    call.server_sendNotification({ serverId, method, params })
  }

  const sendRequest = (method: string, ...params: any[]) => {
    return request.server_sendRequest({ serverId, method, params })
  }

  const onNotification = (method: string, cb: (...args: any[]) => void) => {
    call.server_onNotification({ serverId, method })
    on[`${serverId}:${method}`]((args: any[]) => cb(...args))
  }

  const onRequest = (method: string, cb: (...args: any[]) => Promise<any>) => {
    call.server_onRequest({ serverId, method })
    on[`${serverId}:${method}`]((args: any[]) => cb(...args))
  }

  const onError = (cb: (err: any) => void) => {
    call.server_onError({ serverId })
    on[`${serverId}:onError`]((err: any) => cb(err))
  }

  const onClose = (cb: (err: any) => void) => {
    call.server_onExit({ serverId })
    on[`${serverId}:onClose`]((err: any) => cb(err))
  }

  return { sendNotification, sendRequest, onNotification, onRequest, onError, onClose }
}

const bridgeDebugAdapterServer = (serverId: string): DebugAdapterConnection => {
  const api = {} as DebugAdapterConnection

  api.sendRequest = (command, args) => request.debug_sendRequest({ serverId, command, args })
  api.sendNotification = (response) => call.debug_sendNotification({ serverId, response })

  api.onNotification = (method, cb) => {
    call.debug_onNotification({ serverId, method })
    on[`${serverId}:${method}`]((args: any) => cb(args))
  }

  api.onRequest = cb => {
    call.debug_onRequest({ serverId })
    on[`${serverId}:onRequest`]((args: any) => cb(args))
  }

  api.onError = cb => {
    call.debug_onError({ serverId })
    on[`${serverId}:onError`]((args: any) => cb(args))
  }

  api.onClose = cb => {
    call.debug_onClose({ serverId })
    on[`${serverId}:onClose`](() => cb())
  }

  return api
}

export const load = () => call.load()
export const existsForLanguage = (language: string) => request.existsForLanguage(language)
export const listDebuggers = () => request.listDebuggers()

export const activate = {
  language: async (language: string): Promise<RPCServer> => {
    const serverId = await request.activate({ kind: 'language', data: language })
    if (!serverId) throw new Error(`was not able to start language server for ${language}`)
    return bridgeServer(serverId)
  }
}

export const start = {
  debug: async (type: string): Promise<DebugAdapterConnection> => {
    const serverId = await request.startDebug(type)
    if (!serverId) throw new Error(`was not able to start debug adapter ${type}`)
    return bridgeDebugAdapterServer(serverId)
  }
}
