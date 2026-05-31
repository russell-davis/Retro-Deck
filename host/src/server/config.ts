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
  z.object({
    type: z.literal('profile-cycle'),
    label: z.string().optional(),
    profiles: z.array(z.string()).default([]),
  }),
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

const INPUT_DEFAULTS = { holdMs: 500, doubleTapMs: 250, chordWindowMs: 40, debounceFloorMs: 20 }

const InputConfigSchema = z.object({
  holdMs: z.number().default(INPUT_DEFAULTS.holdMs),
  doubleTapMs: z.number().default(INPUT_DEFAULTS.doubleTapMs),
  chordWindowMs: z.number().default(INPUT_DEFAULTS.chordWindowMs),
  debounceFloorMs: z.number().default(INPUT_DEFAULTS.debounceFloorMs),
})

const ConfigSchema = z.object({
  activeProfile: z.string(),
  profiles: z.record(z.string(), ProfileSchema),
  input: InputConfigSchema.default(INPUT_DEFAULTS),
})

export type Action = z.infer<typeof ActionSchema>
export type ButtonBinding = z.infer<typeof ButtonBindingSchema>
export type Profile = z.infer<typeof ProfileSchema>
export type InputConfig = z.infer<typeof InputConfigSchema>
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
  input: { holdMs: 500, doubleTapMs: 250, chordWindowMs: 40, debounceFloorMs: 20 },
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

export function createProfile(name: string) {
  if (!name || name.includes('/')) throw new Error('invalid profile name')
  const config = getConfig()
  if (config.profiles[name]) throw new Error(`profile "${name}" already exists`)
  saveConfig({
    ...config,
    profiles: { ...config.profiles, [name]: { name, buttons: {} } },
  })
}

export function renameProfile(from: string, to: string) {
  if (!to || to.includes('/')) throw new Error('invalid profile name')
  const config = getConfig()
  if (!config.profiles[from]) throw new Error(`profile "${from}" not found`)
  if (config.profiles[to]) throw new Error(`profile "${to}" already exists`)
  if (from === to) return

  const profiles: Config['profiles'] = {}
  for (const [key, profile] of Object.entries(config.profiles)) {
    const updatedButtons: Profile['buttons'] = {}
    for (const [btnKey, raw] of Object.entries(profile.buttons)) {
      const binding = normalizeBinding(raw)
      const press =
        binding.press?.type === 'profile' && binding.press.profile === from
          ? { ...binding.press, profile: to }
          : binding.press
      const hold =
        binding.hold?.type === 'profile' && binding.hold.profile === from
          ? { ...binding.hold, profile: to }
          : binding.hold
      updatedButtons[btnKey] = { ...binding, press, hold }
    }
    const newKey = key === from ? to : key
    profiles[newKey] = { ...profile, name: key === from ? to : profile.name, buttons: updatedButtons }
  }

  saveConfig({
    ...config,
    activeProfile: config.activeProfile === from ? to : config.activeProfile,
    profiles,
  })
}

export function deleteProfile(name: string) {
  const config = getConfig()
  if (!config.profiles[name]) throw new Error(`profile "${name}" not found`)
  if (Object.keys(config.profiles).length === 1)
    throw new Error('cannot delete the last profile')
  if (config.activeProfile === name)
    throw new Error('cannot delete the active profile — switch first')

  const profiles: Config['profiles'] = {}
  for (const [key, profile] of Object.entries(config.profiles)) {
    if (key === name) continue
    const updatedButtons: Profile['buttons'] = {}
    for (const [btnKey, raw] of Object.entries(profile.buttons)) {
      const binding = normalizeBinding(raw)
      const press =
        binding.press?.type === 'profile' && binding.press.profile === name
          ? ({ type: 'noop' } as const)
          : binding.press
      const hold =
        binding.hold?.type === 'profile' && binding.hold.profile === name
          ? ({ type: 'noop' } as const)
          : binding.hold
      updatedButtons[btnKey] = { ...binding, press, hold }
    }
    profiles[key] = { ...profile, buttons: updatedButtons }
  }

  saveConfig({ ...config, profiles })
}
