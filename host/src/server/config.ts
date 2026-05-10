import { readFileSync, writeFileSync, mkdirSync, watch } from 'node:fs'
import { dirname } from 'node:path'
import { z } from 'zod'
import { emit } from './events'

const CONFIG_PATH =
  process.env.RETRO_DECK_CONFIG_PATH ??
  `${process.env.HOME}/.config/retro-deck/config.json`

const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bash'), label: z.string().optional(), cmd: z.string() }),
  z.object({ type: z.literal('keypress'), label: z.string().optional(), keys: z.array(z.string()) }),
  z.object({ type: z.literal('profile'), label: z.string().optional(), profile: z.string() }),
  z.object({ type: z.literal('noop'), label: z.string().optional() }),
])

const ButtonBindingSchema = z.object({
  press: ActionSchema.optional(),
  hold: ActionSchema.optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
})

const RawButtonSchema = z.union([ActionSchema, ButtonBindingSchema])

const ProfileSchema = z.object({
  name: z.string(),
  buttons: z.record(z.string(), RawButtonSchema),
})

const ConfigSchema = z.object({
  activeProfile: z.string(),
  profiles: z.record(z.string(), ProfileSchema),
})

export type Action = z.infer<typeof ActionSchema>
export type ButtonBinding = z.infer<typeof ButtonBindingSchema>
export type Profile = z.infer<typeof ProfileSchema>
export type Config = z.infer<typeof ConfigSchema>

function isAction(value: unknown): value is Action {
  return !!value && typeof value === 'object' && 'type' in (value as object)
}

export function normalizeBinding(raw: Action | ButtonBinding | undefined): ButtonBinding {
  if (!raw) return {}
  if (isAction(raw)) return { press: raw }
  return raw
}

const DEFAULT_CONFIG: Config = {
  activeProfile: 'default',
  profiles: { default: { name: 'Default', buttons: {} } },
}

function load(): Config {
  try {
    const raw = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
    return ConfigSchema.parse(raw)
  } catch (e) {
    console.warn(`[config] using defaults — could not load ${CONFIG_PATH}:`, (e as Error).message)
    return DEFAULT_CONFIG
  }
}

let current = load()
let lastWrittenAt = 0

try {
  watch(CONFIG_PATH, () => {
    if (Date.now() - lastWrittenAt < 200) return
    current = load()
    console.log('[config] reloaded — active profile:', current.activeProfile)
    emit({ type: 'config.reload', config: current })
  })
} catch {
  // file may not exist yet — watch will be re-established after first save
}

export function getConfig() {
  return current
}

export function getBinding(profile: Profile, key: string): ButtonBinding {
  return normalizeBinding(profile.buttons[key])
}

export function setActiveProfile(name: string) {
  current.activeProfile = name
  saveConfig(current)
}

export function saveConfig(config: Config) {
  ConfigSchema.parse(config)
  mkdirSync(dirname(CONFIG_PATH), { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
  lastWrittenAt = Date.now()
  current = config
  emit({ type: 'config.reload', config: current })
}
