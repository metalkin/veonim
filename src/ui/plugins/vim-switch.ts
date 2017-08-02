import { Actions, Events } from '../../utils'
import { list, switchVim } from '../sessions'
import { filter } from 'fuzzaldrin-plus'
import { h, app } from './plugins'
import TermInput from './input'

interface Session { id: number, name: string }
interface State { val: string, vis: boolean, list: Session[], cache: Session[], ix: number }
const state: State = { val: '', vis: false, list: [], cache: [], ix: 0 }

const view = ({ val, vis, list, ix }: State, { select, hide, change }: any) => h('#vim-switch.plugin', {
  hide: !vis
}, [
  h('.dialog.small', [
    TermInput({ focus: true, val, select, hide, change }),

    h('.row', { render: !list.length }, '...'),

    h('div', list.map((s, key: number) => h('.row', {
      key,
      css: { active: key === ix },
    }, s.name))),
  ])
])

const a: Actions<State> = {}

a.show = (_s, _a, d: Session[]) => ({ list: d, cache: d, vis: true }),
a.hide = () => ({ val: '', vis: false })
a.change = (s, _a, val: string) => ({ val, list: val
  ? filter(s.list, val, { key: 'name' }).slice(0, 10)
  : s.cache.slice(0, 10)
})

a.select = (s, a) => {
  if (!s.list.length) return a.hide()
  const { id } = s.list[s.ix]
  if (id) switchVim(id)
  a.hide()
}

const e: Events<State> = {}
e.show = (_s, a, d: Session[]) => a.show(d)

const emit = app({ state, view, actions: a, events: e })

export default () => emit('show', list())