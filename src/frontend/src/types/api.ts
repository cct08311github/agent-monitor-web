// Agent status from dashboard stream
export interface Agent {
  id: string
  name: string
  workspace: string
  model: string
  status: 'active_executing' | 'active_recent' | 'dormant' | 'offline' | 'inactive'
  emoji: string
  label: string
  currentTask?: {
    task: string
    completedSteps: number
    totalSteps: number
  }
  tokenUsage: number
  costUSD: number
  lastActiveAt?: number
}

export interface CronJob {
  id: string
  name: string
  enabled: boolean
  schedule?: { expr: string }
  agentId?: string
  description?: string
  state?: {
    lastRunAtMs?: number
    nextRunAtMs?: number
    lastStatus?: string // 'ok' | 'error' | 'unknown'
    lastError?: string
  }
}

export interface SubAgent {
  parentId: string
  subId: string
  status: string
  depth: number
}

export interface SystemResources {
  cpu: number
  memory: number
  disk: number
}

export interface DashboardPayload {
  success: boolean
  openclaw?: { version: string }
  sys: SystemResources
  agents: Agent[]
  cron: CronJob[]
  subagents: SubAgent[]
  cooldowns: Record<string, { cooldownUntilMs: number; remaining: number }>
  exchangeRate: number
}

export type TaskDomain = 'work' | 'personal' | 'sideproject'
export type TaskPriority = 'urgent' | 'high' | 'medium' | 'low'

export interface Task {
  id: string
  domain: TaskDomain
  title: string
  description?: string
  status: string
  priority: TaskPriority
  dueDate?: string
  createdAt: string
  updatedAt: string
  tags?: string[]
  notes?: string
}

export interface ApiError {
  success: false
  error: string
  requestId?: string
  retryAfter?: number
  output?: string
}

export interface AuthMeResponse {
  success: boolean
  username: string
}

export interface AuthLoginResponse {
  success: boolean
  username: string
}
