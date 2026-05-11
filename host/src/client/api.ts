import { hc } from 'hono/client'
import type { Api } from '../server/api'

export const client = hc<Api>('/')
