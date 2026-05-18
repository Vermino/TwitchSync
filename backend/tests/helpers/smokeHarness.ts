import path from 'path';

type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused' | 'downloading';
type VodStatus = 'pending' | 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled' | 'paused';
type VodPriority = 'low' | 'normal' | 'high' | 'critical';

interface SmokeTask {
  id: number;
  user_id: number;
  name: string;
  description: string;
  task_type: 'channel' | 'game' | 'combined';
  channel_ids: number[];
  game_ids: number[];
  schedule_type: 'interval' | 'cron' | 'manual';
  schedule_value: string;
  storage_limit_gb: number;
  retention_days: number;
  auto_delete: boolean;
  is_active: boolean;
  priority: 'low' | 'medium' | 'high';
  quality: string | null;
  conditions: Record<string, any>;
  restrictions: Record<string, any>;
  next_run: string | null;
  created_at: string;
  updated_at: string;
  status: TaskStatus;
  monitoring_enabled: boolean;
  monitoring_status: string;
}

interface SmokeMonitoring {
  task_id: number;
  status: string;
  status_message: string;
  progress_percentage: number;
  items_total: number;
  items_completed: number;
  items_failed: number;
  updated_at: string;
}

interface SmokeVod {
  id: number;
  twitch_id: string;
  task_id: number;
  channel_id: number;
  game_id: number | null;
  title: string;
  created_at: string;
  published_at: string;
  thumbnail_url: string | null;
  duration: string;
  download_status: VodStatus;
  download_priority: VodPriority;
  download_progress: number;
  error_message: string | null;
  file_size: number;
  download_path: string | null;
  retry_count: number;
  max_retries: number;
  started_at: string | null;
  downloaded_at: string | null;
  updated_at: string;
  scheduled_for: string | null;
  current_segment: number | null;
  total_segments: number | null;
  download_speed: number | null;
  eta_seconds: number | null;
  pause_reason: string | null;
  paused_at: string | null;
  resume_segment_index: number;
}

interface CompletedVod {
  vod_id: number;
  task_id: number;
  completed_at: string;
  file_size_bytes: number;
  download_speed_mbps: number;
  download_duration_seconds: number;
}

interface TaskPerformanceMetric {
  task_id: number;
  timestamp: string;
  success_rate: number;
  failure_rate: number;
  avg_download_speed: number;
  vod_count: number;
  storage_used: number;
}

type QueryResult = {
  rows: any[];
  rowCount: number;
};

const FIXED_NOW = Date.parse('2026-05-15T20:00:00.000Z');
const ACTIVE_DOWNLOAD_VOD_ID = 105;

const priorityRank: Record<VodPriority, number> = {
  critical: 1,
  high: 2,
  normal: 3,
  low: 4,
};

const vodListStatusRank: Record<string, number> = {
  downloading: 1,
  queued: 2,
  pending: 3,
  failed: 4,
  completed: 5,
  cancelled: 6,
  paused: 7,
};

const iso = (offsetMinutes: number) => new Date(FIXED_NOW + offsetMinutes * 60_000).toISOString();

const toNumber = (value: unknown) => Number(value);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

const emptyResult = (): QueryResult => ({ rows: [], rowCount: 0 });

export const AUTH_HEADERS = {
  user1: { Authorization: 'Bearer user-1' },
  user2: { Authorization: 'Bearer user-2' },
};

export class SmokeStore {
  private nextTaskId = 3;

  private readonly channels = new Map<number, { id: number; username: string }>([
    [10, { id: 10, username: 'smoke-streamer' }],
    [11, { id: 11, username: 'other-streamer' }],
  ]);

  private readonly games = new Map<number, { id: number; name: string }>([
    [20, { id: 20, name: 'RimWorld' }],
    [21, { id: 21, name: 'Factorio' }],
  ]);

  private readonly preferences = new Map<string, { download_priority: VodPriority }>([
    ['1:10', { download_priority: 'high' }],
    ['2:11', { download_priority: 'low' }],
  ]);

  public tasks = new Map<number, SmokeTask>();
  public monitoring = new Map<number, SmokeMonitoring>();
  public vods = new Map<number, SmokeVod>();
  public completedVods = new Map<number, CompletedVod>();
  public performanceMetrics: TaskPerformanceMetric[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.nextTaskId = 3;
    this.tasks.clear();
    this.monitoring.clear();
    this.vods.clear();
    this.completedVods.clear();
    this.performanceMetrics = [];

    const taskOne: SmokeTask = {
      id: 1,
      user_id: 1,
      name: 'Smoke Task',
      description: 'Primary smoke-test task',
      task_type: 'combined',
      channel_ids: [10],
      game_ids: [20],
      schedule_type: 'manual',
      schedule_value: 'manual',
      storage_limit_gb: 25,
      retention_days: 30,
      auto_delete: false,
      is_active: true,
      priority: 'medium',
      quality: 'source',
      conditions: {},
      restrictions: {},
      next_run: null,
      created_at: iso(-240),
      updated_at: iso(-30),
      status: 'running',
      monitoring_enabled: true,
      monitoring_status: 'running',
    };

    const taskTwo: SmokeTask = {
      id: 2,
      user_id: 2,
      name: 'Other User Task',
      description: 'Second-user task',
      task_type: 'channel',
      channel_ids: [11],
      game_ids: [21],
      schedule_type: 'manual',
      schedule_value: 'manual',
      storage_limit_gb: 5,
      retention_days: 7,
      auto_delete: false,
      is_active: true,
      priority: 'low',
      quality: null,
      conditions: {},
      restrictions: {},
      next_run: null,
      created_at: iso(-180),
      updated_at: iso(-20),
      status: 'running',
      monitoring_enabled: true,
      monitoring_status: 'running',
    };

    this.tasks.set(taskOne.id, taskOne);
    this.tasks.set(taskTwo.id, taskTwo);

    this.monitoring.set(1, {
      task_id: 1,
      status: 'running',
      status_message: 'Scanning for new VODs',
      progress_percentage: 40,
      items_total: 7,
      items_completed: 1,
      items_failed: 2,
      updated_at: iso(-5),
    });

    this.monitoring.set(2, {
      task_id: 2,
      status: 'running',
      status_message: 'Waiting for VODs',
      progress_percentage: 0,
      items_total: 1,
      items_completed: 0,
      items_failed: 0,
      updated_at: iso(-5),
    });

    [
      {
        id: 101,
        twitch_id: 'twitch-101',
        task_id: 1,
        channel_id: 10,
        game_id: 20,
        title: 'Pending capture',
        created_at: iso(-140),
        published_at: iso(-140),
        thumbnail_url: 'https://example.com/thumb-101-%{width}x%{height}.jpg',
        duration: '2h5m0s',
        download_status: 'pending',
        download_priority: 'low',
        download_progress: 0,
        error_message: null,
        file_size: 0,
        download_path: null,
        retry_count: 0,
        max_retries: 3,
        started_at: null,
        downloaded_at: null,
        updated_at: iso(-22),
        scheduled_for: null,
        current_segment: null,
        total_segments: null,
        download_speed: null,
        eta_seconds: null,
        pause_reason: null,
        paused_at: null,
        resume_segment_index: 0,
      },
      {
        id: 102,
        twitch_id: 'twitch-102',
        task_id: 1,
        channel_id: 10,
        game_id: 20,
        title: 'Retryable failure',
        created_at: iso(-130),
        published_at: iso(-130),
        thumbnail_url: 'https://example.com/thumb-102-%{width}x%{height}.jpg',
        duration: '1h0m0s',
        download_status: 'failed',
        download_priority: 'high',
        download_progress: 12,
        error_message: 'network timeout',
        file_size: 0,
        download_path: null,
        retry_count: 1,
        max_retries: 3,
        started_at: iso(-60),
        downloaded_at: null,
        updated_at: iso(-18),
        scheduled_for: null,
        current_segment: null,
        total_segments: null,
        download_speed: null,
        eta_seconds: null,
        pause_reason: null,
        paused_at: null,
        resume_segment_index: 0,
      },
      {
        id: 103,
        twitch_id: 'twitch-103',
        task_id: 1,
        channel_id: 10,
        game_id: 20,
        title: 'Retry exhausted failure',
        created_at: iso(-125),
        published_at: iso(-125),
        thumbnail_url: 'https://example.com/thumb-103-%{width}x%{height}.jpg',
        duration: '45m0s',
        download_status: 'failed',
        download_priority: 'normal',
        download_progress: 0,
        error_message: 'playlist missing',
        file_size: 0,
        download_path: null,
        retry_count: 3,
        max_retries: 3,
        started_at: iso(-55),
        downloaded_at: null,
        updated_at: iso(-17),
        scheduled_for: null,
        current_segment: null,
        total_segments: null,
        download_speed: null,
        eta_seconds: null,
        pause_reason: null,
        paused_at: null,
        resume_segment_index: 0,
      },
      {
        id: 104,
        twitch_id: 'twitch-104',
        task_id: 1,
        channel_id: 10,
        game_id: 20,
        title: 'Completed archive',
        created_at: iso(-120),
        published_at: iso(-120),
        thumbnail_url: 'https://example.com/thumb-104-%{width}x%{height}.jpg',
        duration: '3h10m0s',
        download_status: 'completed',
        download_priority: 'low',
        download_progress: 100,
        error_message: null,
        file_size: 4096,
        download_path: path.join(process.cwd(), 'vod-storage', 'smoke-completed-104.mp4'),
        retry_count: 0,
        max_retries: 3,
        started_at: iso(-40),
        downloaded_at: iso(-15),
        updated_at: iso(-15),
        scheduled_for: null,
        current_segment: null,
        total_segments: null,
        download_speed: 2.5,
        eta_seconds: 0,
        pause_reason: null,
        paused_at: null,
        resume_segment_index: 0,
      },
      {
        id: 105,
        twitch_id: 'twitch-105',
        task_id: 1,
        channel_id: 10,
        game_id: 20,
        title: 'Active download',
        created_at: iso(-100),
        published_at: iso(-100),
        thumbnail_url: 'https://example.com/thumb-105-%{width}x%{height}.jpg',
        duration: '1h45m0s',
        download_status: 'downloading',
        download_priority: 'critical',
        download_progress: 55,
        error_message: null,
        file_size: 0,
        download_path: null,
        retry_count: 0,
        max_retries: 3,
        started_at: iso(-10),
        downloaded_at: null,
        updated_at: iso(-1),
        scheduled_for: iso(-12),
        current_segment: 8,
        total_segments: 20,
        download_speed: 2.75,
        eta_seconds: 120,
        pause_reason: null,
        paused_at: null,
        resume_segment_index: 0,
      },
      {
        id: 106,
        twitch_id: 'twitch-106',
        task_id: 1,
        channel_id: 10,
        game_id: 20,
        title: 'Paused download',
        created_at: iso(-90),
        published_at: iso(-90),
        thumbnail_url: 'https://example.com/thumb-106-%{width}x%{height}.jpg',
        duration: '2h0m0s',
        download_status: 'paused',
        download_priority: 'normal',
        download_progress: 48,
        error_message: null,
        file_size: 0,
        download_path: null,
        retry_count: 0,
        max_retries: 3,
        started_at: iso(-20),
        downloaded_at: null,
        updated_at: iso(-4),
        scheduled_for: iso(-24),
        current_segment: 7,
        total_segments: 15,
        download_speed: 1.4,
        eta_seconds: 300,
        pause_reason: 'task_paused',
        paused_at: iso(-3),
        resume_segment_index: 7,
      },
      {
        id: 107,
        twitch_id: 'twitch-107',
        task_id: 1,
        channel_id: 10,
        game_id: 20,
        title: 'Cancelled item',
        created_at: iso(-80),
        published_at: iso(-80),
        thumbnail_url: 'https://example.com/thumb-107-%{width}x%{height}.jpg',
        duration: '30m0s',
        download_status: 'cancelled',
        download_priority: 'low',
        download_progress: 0,
        error_message: 'cancelled by user',
        file_size: 0,
        download_path: null,
        retry_count: 0,
        max_retries: 3,
        started_at: iso(-30),
        downloaded_at: null,
        updated_at: iso(-2),
        scheduled_for: null,
        current_segment: null,
        total_segments: null,
        download_speed: null,
        eta_seconds: null,
        pause_reason: null,
        paused_at: null,
        resume_segment_index: 0,
      },
      {
        id: 201,
        twitch_id: 'twitch-201',
        task_id: 2,
        channel_id: 11,
        game_id: 21,
        title: 'Other user pending',
        created_at: iso(-70),
        published_at: iso(-70),
        thumbnail_url: 'https://example.com/thumb-201-%{width}x%{height}.jpg',
        duration: '1h10m0s',
        download_status: 'pending',
        download_priority: 'normal',
        download_progress: 0,
        error_message: null,
        file_size: 0,
        download_path: null,
        retry_count: 0,
        max_retries: 3,
        started_at: null,
        downloaded_at: null,
        updated_at: iso(-8),
        scheduled_for: null,
        current_segment: null,
        total_segments: null,
        download_speed: null,
        eta_seconds: null,
        pause_reason: null,
        paused_at: null,
        resume_segment_index: 0,
      },
    ].forEach((vod) => this.vods.set(vod.id, vod as SmokeVod));

    this.completedVods.set(104, {
      vod_id: 104,
      task_id: 1,
      completed_at: iso(-15),
      file_size_bytes: 4096,
      download_speed_mbps: 2.5,
      download_duration_seconds: 300,
    });

    this.performanceMetrics.push(
      {
        task_id: 1,
        timestamp: iso(-60),
        success_rate: 20,
        failure_rate: 40,
        avg_download_speed: 2.25,
        vod_count: 5,
        storage_used: 4096,
      },
      {
        task_id: 1,
        timestamp: iso(-10),
        success_rate: 20,
        failure_rate: 40,
        avg_download_speed: 2.5,
        vod_count: 5,
        storage_used: 4096,
      },
      {
        task_id: 2,
        timestamp: iso(-15),
        success_rate: 0,
        failure_rate: 0,
        avg_download_speed: 0,
        vod_count: 1,
        storage_used: 0,
      }
    );
  }

  getTask(taskId: number) {
    return this.tasks.get(taskId);
  }

  getVod(vodId: number) {
    return this.vods.get(vodId);
  }

  getActiveDownloadState() {
    return this.getVod(ACTIVE_DOWNLOAD_VOD_ID);
  }

  addToQueue(vodId: number, priority: VodPriority) {
    const vod = this.requireVod(vodId);
    vod.download_status = 'queued';
    vod.download_priority = priority;
    vod.error_message = null;
    vod.scheduled_for = iso(0);
    vod.updated_at = iso(0);
  }

  setTaskStatusById(taskId: number, status: TaskStatus, active: boolean = true) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    task.status = status;
    task.is_active = active;
    task.updated_at = iso(0);
    return clone(task);
  }

  redownloadVodForUser(vodId: number, userId: number) {
    const vod = this.findVodForUser(vodId, userId);
    if (!vod) {
      return null;
    }

    this.completedVods.delete(vod.id);
    vod.download_status = 'queued';
    vod.download_progress = 0;
    vod.error_message = null;
    vod.file_size = 0;
    vod.download_path = null;
    vod.started_at = null;
    vod.downloaded_at = null;
    vod.current_segment = null;
    vod.total_segments = null;
    vod.download_speed = null;
    vod.eta_seconds = null;
    vod.pause_reason = null;
    vod.paused_at = null;
    vod.resume_segment_index = 0;
    vod.updated_at = iso(0);

    return clone(vod);
  }

  retryFailedDownloadDirect(vodId: number) {
    const vod = this.requireVod(vodId);
    vod.download_status = 'queued';
    vod.retry_count += 1;
    vod.download_progress = 0;
    vod.error_message = null;
    vod.updated_at = iso(0);
  }

  cancelDownloadDirect(vodId: number) {
    const vod = this.requireVod(vodId);
    vod.download_status = 'cancelled';
    vod.error_message = vod.error_message ?? 'cancelled by smoke test';
    vod.updated_at = iso(0);
    this.reconcileTaskAfterDownloadMutation(vod.task_id);
  }

  getQueueStatusSummary() {
    const vods = Array.from(this.vods.values());
    return {
      pending: vods.filter((vod) => vod.download_status === 'pending' || vod.download_status === 'queued').length,
      downloading: vods.filter((vod) => vod.download_status === 'downloading').length,
      failed: vods.filter((vod) => vod.download_status === 'failed').length,
      completed: vods.filter((vod) => vod.download_status === 'completed').length,
    };
  }

  createTaskFromInsert(params: any[]) {
    const now = iso(0);
    const task: SmokeTask = {
      id: this.nextTaskId++,
      user_id: toNumber(params[0]),
      name: String(params[1]),
      description: String(params[2] ?? ''),
      task_type: params[3],
      channel_ids: clone(params[4] ?? []),
      game_ids: clone(params[5] ?? []),
      schedule_type: params[6],
      schedule_value: String(params[7]),
      storage_limit_gb: toNumber(params[8] ?? 0),
      retention_days: toNumber(params[9] ?? 7),
      auto_delete: Boolean(params[10]),
      is_active: Boolean(params[11]),
      priority: params[12] ?? 'low',
      quality: params[13] ?? null,
      conditions: clone(params[14] ?? {}),
      restrictions: clone(params[15] ?? {}),
      next_run: now,
      created_at: now,
      updated_at: now,
      status: 'pending',
      monitoring_enabled: true,
      monitoring_status: 'pending',
    };
    this.tasks.set(task.id, task);
    return task.id;
  }

  upsertMonitoring(taskId: number, partial: Partial<SmokeMonitoring>) {
    const existing = this.monitoring.get(taskId);
    const monitoring: SmokeMonitoring = {
      task_id: taskId,
      status: partial.status ?? existing?.status ?? 'pending',
      status_message: partial.status_message ?? existing?.status_message ?? 'Task created',
      progress_percentage: partial.progress_percentage ?? existing?.progress_percentage ?? 0,
      items_total: partial.items_total ?? existing?.items_total ?? 0,
      items_completed: partial.items_completed ?? existing?.items_completed ?? 0,
      items_failed: partial.items_failed ?? existing?.items_failed ?? 0,
      updated_at: iso(0),
    };
    this.monitoring.set(taskId, monitoring);

    const task = this.tasks.get(taskId);
    if (task) {
      task.monitoring_status = monitoring.status;
    }
  }

  setTaskActive(taskId: number, userId: number, active: boolean) {
    const task = this.findTaskForUser(taskId, userId);
    if (!task) {
      return null;
    }

    task.is_active = active;
    task.status = active ? 'running' : 'pending';
    task.updated_at = iso(0);

    const counts = this.getTaskCounts(taskId);
    this.upsertMonitoring(taskId, active ? {
      status: 'running',
      status_message: counts.total > 0
        ? `Downloaded: ${counts.completed}/${counts.total} VODs completed`
        : 'Task activated - discovering VODs',
      progress_percentage: counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0,
      items_total: counts.total,
      items_completed: counts.completed,
      items_failed: 0,
    } : {
      status: 'pending',
      status_message: 'Task deactivated',
      progress_percentage: 0,
      items_total: 0,
      items_completed: 0,
      items_failed: 0,
    });

    return clone(task);
  }

  activateTaskById(taskId: number) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    task.is_active = true;
    task.status = 'running';
    task.updated_at = iso(0);
    return clone(task);
  }

  updateTaskFromQuery(taskId: number, userId: number, sql: string, params: any[]) {
    const task = this.findTaskForUser(taskId, userId);
    if (!task) {
      return null;
    }

    if (sql.includes('is_active = $1')) {
      task.is_active = Boolean(params[0]);
    }

    if (sql.includes("status = 'running'::task_status")) {
      task.status = 'running';
    } else if (sql.includes("status = 'pending'::task_status")) {
      task.status = 'pending';
    } else if (sql.includes("status = 'paused'::task_status")) {
      task.status = 'paused';
    }

    if (sql.includes("priority = 'high'::task_priority_level")) {
      task.priority = 'high';
    } else if (sql.includes("priority = 'medium'::task_priority_level")) {
      task.priority = 'medium';
    } else if (sql.includes("priority = 'low'::task_priority_level")) {
      task.priority = 'low';
    }

    task.updated_at = iso(0);
    return clone(task);
  }

  getTaskCounts(taskId: number) {
    const vods = Array.from(this.vods.values()).filter((vod) => vod.task_id === taskId);
    return {
      total: vods.length,
      completed: vods.filter((vod) => vod.download_status === 'completed').length,
    };
  }

  getTaskDownloadSummary(taskId: number) {
    const vods = Array.from(this.vods.values()).filter((vod) => vod.task_id === taskId);
    return {
      total: vods.length,
      active: vods.filter((vod) => ['queued', 'downloading'].includes(vod.download_status)).length,
      waiting: vods.filter((vod) => ['pending', 'paused'].includes(vod.download_status)).length,
      completed: vods.filter((vod) => vod.download_status === 'completed').length,
      failed: vods.filter((vod) => vod.download_status === 'failed').length,
      cancelled: vods.filter((vod) => vod.download_status === 'cancelled').length,
    };
  }

  reconcileTaskAfterDownloadMutation(taskId: number) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return;
    }

    const summary = this.getTaskDownloadSummary(taskId);

    if (summary.active > 0) {
      task.status = 'downloading';
      this.upsertMonitoring(taskId, {
        status: 'downloading',
        status_message: `Downloads in progress: ${summary.active} active`,
        progress_percentage: summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0,
        items_total: summary.total,
        items_completed: summary.completed,
        items_failed: summary.failed + summary.cancelled,
      });
    } else if (summary.waiting > 0) {
      task.status = 'running';
      this.upsertMonitoring(taskId, {
        status: 'running',
        status_message: `Waiting to download: ${summary.waiting} pending`,
        progress_percentage: summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0,
        items_total: summary.total,
        items_completed: summary.completed,
        items_failed: summary.failed + summary.cancelled,
      });
    } else if (summary.total > 0) {
      task.status = 'completed';
      this.upsertMonitoring(taskId, {
        status: 'completed',
        status_message: `Downloads finished: ${summary.completed}/${summary.total} completed, ${summary.failed} failed, ${summary.cancelled} cancelled`,
        progress_percentage: Math.round((summary.completed / summary.total) * 100),
        items_total: summary.total,
        items_completed: summary.completed,
        items_failed: summary.failed + summary.cancelled,
      });
    }

    task.updated_at = iso(0);
  }

  listVodsForUser(userId: number, statusFilter?: string[], taskId?: number) {
    const base = Array.from(this.vods.values())
      .filter((vod) => {
        const task = this.tasks.get(vod.task_id);
        return task?.user_id === userId;
      })
      .filter((vod) => !statusFilter || statusFilter.includes(vod.download_status))
      .filter((vod) => taskId === undefined || vod.task_id === taskId);

    const activeQueue = base
      .filter((vod) => ['pending', 'queued', 'downloading'].includes(vod.download_status))
      .sort(this.sortByQueuePriority);

    const queuePositions = new Map<number, number>();
    activeQueue.forEach((vod, index) => queuePositions.set(vod.id, index + 1));

    return base
      .slice()
      .sort((left, right) => {
        const leftStatus = vodListStatusRank[left.download_status] ?? 99;
        const rightStatus = vodListStatusRank[right.download_status] ?? 99;
        if (leftStatus !== rightStatus) {
          return leftStatus - rightStatus;
        }

        const leftPriority = priorityRank[left.download_priority] ?? 99;
        const rightPriority = priorityRank[right.download_priority] ?? 99;
        if (leftPriority !== rightPriority) {
          return leftPriority - rightPriority;
        }

        return right.created_at.localeCompare(left.created_at);
      })
      .map((vod) => this.serializeVod(vod, queuePositions.get(vod.id)));
  }

  getQueueItemsForUser(userId: number, statusFilter: string[], limit: number, offset: number) {
    const items = Array.from(this.vods.values())
      .filter((vod) => {
        const task = this.tasks.get(vod.task_id);
        return task?.user_id === userId && statusFilter.includes(vod.download_status);
      })
      .sort(this.sortByQueuePriority)
      .map((vod, index) => ({
        ...this.serializeVod(vod, index + 1),
        position_in_queue: index + 1,
      }));

    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
    };
  }

  getHistoryForUser(userId: number, statusFilter: string[], limit: number, offset: number, taskId?: number) {
    const items = Array.from(this.vods.values())
      .filter((vod) => {
        const task = this.tasks.get(vod.task_id);
        return task?.user_id === userId
          && statusFilter.includes(vod.download_status)
          && (taskId === undefined || vod.task_id === taskId);
      })
      .sort((left, right) => this.getHistoryCompletedAt(right).localeCompare(this.getHistoryCompletedAt(left)))
      .map((vod) => ({
        ...this.serializeVod(vod),
        vod_id: vod.id,
        status: vod.download_status,
        file_path: vod.download_path,
        completed_at: this.getHistoryCompletedAt(vod),
        download_speed: this.completedVods.get(vod.id)?.download_speed_mbps ?? 0,
        download_time: this.completedVods.get(vod.id)?.download_duration_seconds ?? 0,
        file_size: this.completedVods.get(vod.id)?.file_size_bytes ?? vod.file_size ?? 0,
      }));

    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
    };
  }

  getQueueStatsForUser(userId: number, taskId?: number) {
    const vods = Array.from(this.vods.values()).filter((vod) => {
      const task = this.tasks.get(vod.task_id);
      return task?.user_id === userId && (taskId === undefined || vod.task_id === taskId);
    });

    const completed = vods.filter((vod) => vod.download_status === 'completed');

    return {
      pending: vods.filter((vod) => vod.download_status === 'pending').length,
      queued: vods.filter((vod) => vod.download_status === 'queued').length,
      downloading: vods.filter((vod) => vod.download_status === 'downloading').length,
      completed: completed.length,
      failed: vods.filter((vod) => vod.download_status === 'failed').length,
      total_size_bytes: completed.reduce((sum, vod) => sum + (vod.file_size || 0), 0),
      avg_download_speed: completed.length > 0
        ? completed.reduce((sum, vod) => sum + (vod.download_speed || 0), 0) / completed.length
        : 0,
    };
  }

  getQueueEstimateForUser(userId: number, taskId?: number) {
    const queuedVods = Array.from(this.vods.values()).filter((vod) => {
      const task = this.tasks.get(vod.task_id);
      return task?.user_id === userId
        && ['pending', 'queued'].includes(vod.download_status)
        && (taskId === undefined || vod.task_id === taskId);
    });

    const durations = Array.from(this.completedVods.values()).map((vod) => vod.download_duration_seconds);
    const averageSeconds = durations.length > 0
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : 300;

    return {
      estimatedMinutes: Math.ceil((queuedVods.length * averageSeconds) / 60),
      totalItems: queuedVods.length,
    };
  }

  getMonitoringStatsForTask(taskId: number, userId: number) {
    const task = this.findTaskForUser(taskId, userId);
    if (!task) {
      return null;
    }

    const vods = Array.from(this.vods.values()).filter((vod) => vod.task_id === taskId);
    const completed = vods.filter((vod) => vod.download_status === 'completed');

    return {
      id: task.id,
      storage_limit_gb: task.storage_limit_gb,
      total_vods: vods.length,
      completed_vods: completed.length,
      failed_vods: vods.filter((vod) => vod.download_status === 'failed').length,
      active_downloads: vods.filter((vod) => ['queued', 'downloading'].includes(vod.download_status)).length,
      storage_used_bytes: completed.reduce((sum, vod) => {
        const completedVod = this.completedVods.get(vod.id);
        return sum + (completedVod?.file_size_bytes ?? vod.file_size ?? 0);
      }, 0),
    };
  }

  getPerformanceMetricsForTask(taskId: number, userId: number, interval: string) {
    const task = this.findTaskForUser(taskId, userId);
    if (!task) {
      return null;
    }

    const intervalMinutes = interval.includes('hour')
      ? 60
      : interval.includes('week')
        ? 7 * 24 * 60
        : interval.includes('month')
          ? 30 * 24 * 60
          : 24 * 60;
    const cutoff = FIXED_NOW - intervalMinutes * 60_000;

    return this.performanceMetrics
      .filter((metric) => metric.task_id === taskId && Date.parse(metric.timestamp) >= cutoff)
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .map((metric) => ({
        timestamp: metric.timestamp,
        success_rate: metric.success_rate,
        failure_rate: metric.failure_rate,
        avg_download_speed: metric.avg_download_speed,
        vod_count: metric.vod_count,
        storage_used: metric.storage_used,
      }));
  }

  deleteHistoryItemForUser(vodId: number, userId: number) {
    const vod = this.findVodForUser(vodId, userId);
    if (!vod || !['completed', 'failed', 'cancelled'].includes(vod.download_status)) {
      return false;
    }

    this.completedVods.delete(vodId);
    this.vods.delete(vodId);
    return true;
  }

  retryFailedVodForUser(vodId: number, userId: number, resetRetryCount: boolean) {
    const vod = this.findVodForUser(vodId, userId);
    if (!vod || vod.download_status !== 'failed') {
      return null;
    }

    if (!resetRetryCount && vod.retry_count >= vod.max_retries) {
      return null;
    }

    vod.download_status = 'pending';
    vod.error_message = null;
    vod.download_progress = 0;
    vod.retry_count = resetRetryCount ? 0 : vod.retry_count + 1;
    vod.scheduled_for = iso(0);
    vod.updated_at = iso(0);

    return clone(vod);
  }

  pauseDownload(vodId: number, segmentIndex: number) {
    const vod = this.requireVod(vodId);
    vod.resume_segment_index = segmentIndex;
    vod.download_status = 'paused';
    vod.pause_reason = 'task_paused';
    vod.paused_at = iso(0);
    vod.updated_at = iso(0);
  }

  pauseQueuedAndDownloading() {
    this.vods.forEach((vod) => {
      if (vod.download_status === 'queued' || vod.download_status === 'downloading') {
        vod.download_status = 'paused';
        vod.pause_reason = 'task_paused';
        vod.paused_at = iso(0);
        vod.updated_at = iso(0);
      }
    });
  }

  resumePausedDownloads() {
    this.vods.forEach((vod) => {
      const task = this.tasks.get(vod.task_id);
      if (
        vod.download_status === 'paused'
        && vod.pause_reason === 'task_paused'
        && task
        && ['running', 'downloading'].includes(task.status)
      ) {
        vod.download_status = 'queued';
        vod.pause_reason = null;
        vod.paused_at = null;
        vod.updated_at = iso(0);
      }
    });
  }

  handleQuery(queryText: string, params: any[] = []): QueryResult {
    const sql = queryText.replace(/\s+/g, ' ').trim().toLowerCase();

    if (sql === 'begin' || sql === 'commit' || sql === 'rollback') {
      return emptyResult();
    }

    if (sql.includes('insert into tasks') && sql.includes('returning id')) {
      const id = this.createTaskFromInsert(params);
      return { rows: [{ id }], rowCount: 1 };
    }

    if (sql.includes('insert into task_monitoring')) {
      const taskId = toNumber(params[0]);
      if (sql.includes("values ($1, 'pending', 'task created'")) {
        this.upsertMonitoring(taskId, {
          status: 'pending',
          status_message: 'Task created',
          progress_percentage: 0,
          items_total: 0,
          items_completed: 0,
          items_failed: 0,
        });
      } else if (sql.includes("values ($1, 'running', $2")) {
        this.upsertMonitoring(taskId, {
          status: 'running',
          status_message: String(params[1]),
          progress_percentage: toNumber(params[2]),
          items_total: toNumber(params[3]),
          items_completed: toNumber(params[4]),
          items_failed: 0,
        });
      } else if (sql.includes("values ($1, 'pending', 'task deactivated'")) {
        this.upsertMonitoring(taskId, {
          status: 'pending',
          status_message: 'Task deactivated',
          progress_percentage: 0,
          items_total: 0,
          items_completed: 0,
          items_failed: 0,
        });
      }
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.includes('select t.*, tm.status as monitoring_status')
      && sql.includes('from tasks t')
      && sql.includes('where t.id = $1 and t.user_id = $2')
    ) {
      const task = this.findTaskForUser(toNumber(params[0]), toNumber(params[1]));
      return task
        ? { rows: [this.serializeTask(task)], rowCount: 1 }
        : emptyResult();
    }

    if (sql.includes("update tasks set is_active = $3, status = case")) {
      const updatedTask = this.setTaskActive(toNumber(params[0]), toNumber(params[1]), Boolean(params[2]));
      return updatedTask
        ? { rows: [updatedTask], rowCount: 1 }
        : emptyResult();
    }

    if (sql.includes('select id from task_monitoring where task_id = $1')) {
      const exists = this.monitoring.has(toNumber(params[0]));
      return exists
        ? { rows: [{ id: toNumber(params[0]) }], rowCount: 1 }
        : emptyResult();
    }

    if (
      sql.includes('select coalesce((select count(*) from completed_vods cv where cv.task_id = $1), 0) as completed_count')
      && sql.includes('coalesce((select count(*) from vods v where v.task_id = $1), 0) as total_count')
    ) {
      const counts = this.getTaskCounts(toNumber(params[0]));
      return { rows: [{ completed_count: counts.completed, total_count: counts.total }], rowCount: 1 };
    }

    if (sql.includes("update task_monitoring set status = 'running'")) {
      this.upsertMonitoring(toNumber(params[0]), {
        status: 'running',
        status_message: String(params[1]),
        progress_percentage: toNumber(params[2]),
        items_total: toNumber(params[3]),
        items_completed: toNumber(params[4]),
      });
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.includes("update tasks set status = 'downloading'")
      && sql.includes('is_active = true')
      && sql.includes('where id = $1')
    ) {
      const updatedTask = this.setTaskStatusById(toNumber(params[0]), 'downloading', true);
      return updatedTask ? { rows: [], rowCount: 1 } : emptyResult();
    }

    if (sql.includes('update task_monitoring set status = $1')) {
      this.upsertMonitoring(toNumber(params[2]), {
        status: String(params[0]),
        status_message: String(params[1]),
      });
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.startsWith('update tasks set')
      && sql.includes('returning *')
      && sql.includes('where id = $')
      && sql.includes('and user_id = $')
    ) {
      const taskId = toNumber(params[params.length - 2]);
      const userId = toNumber(params[params.length - 1]);
      const updatedTask = this.updateTaskFromQuery(taskId, userId, sql, params);
      return updatedTask
        ? { rows: [updatedTask], rowCount: 1 }
        : emptyResult();
    }

    if (
      sql.includes("update tasks set status = 'running'::task_status")
      && sql.includes('is_active = true')
      && sql.includes('where id = $1')
      && sql.includes('returning *')
    ) {
      const updatedTask = this.activateTaskById(toNumber(params[0]));
      return updatedTask
        ? { rows: [updatedTask], rowCount: 1 }
        : emptyResult();
    }

    if (
      sql.includes('select v.id, v.channel_id')
      && sql.includes('from vods v')
      && sql.includes('join tasks t on v.task_id = t.id')
      && sql.includes('where v.id = $1 and t.user_id = $2')
    ) {
      const vod = this.findVodForUser(toNumber(params[0]), toNumber(params[1]));
      return vod
        ? {
            rows: [{
              id: vod.id,
              channel_id: vod.channel_id,
              download_status: vod.download_status,
              task_id: vod.task_id,
              twitch_id: vod.twitch_id,
            }],
            rowCount: 1,
          }
        : emptyResult();
    }

    if (
      sql.includes('select v.id, v.task_id, v.twitch_id')
      && sql.includes('from vods v')
      && sql.includes('join tasks t on v.task_id = t.id')
      && sql.includes('where v.id = $1 and t.user_id = $2')
    ) {
      const vod = this.findVodForUser(toNumber(params[0]), toNumber(params[1]));
      return vod
        ? {
            rows: [{
              id: vod.id,
              task_id: vod.task_id,
              twitch_id: vod.twitch_id,
            }],
            rowCount: 1,
          }
        : emptyResult();
    }

    if (
      sql.includes('select v.id')
      && sql.includes('from vods v')
      && sql.includes('join tasks t on v.task_id = t.id')
      && sql.includes('where v.id = $1 and t.user_id = $2')
      && !sql.includes('retry_count')
    ) {
      const vod = this.findVodForUser(toNumber(params[0]), toNumber(params[1]));
      return vod ? { rows: [{ id: vod.id }], rowCount: 1 } : emptyResult();
    }

    if (sql.includes('select * from user_vod_preferences where user_id = $1 and channel_id = $2')) {
      const pref = this.preferences.get(`${toNumber(params[0])}:${toNumber(params[1])}`);
      return pref ? { rows: [clone(pref)], rowCount: 1 } : emptyResult();
    }

    if (
      sql.includes('from vods v left join tasks t on v.task_id = t.id')
      && sql.includes('left join channels c on v.channel_id = c.id')
      && sql.includes('left join games g on v.game_id = g.id')
      && sql.includes('left join completed_vods cv on v.id = cv.vod_id')
      && sql.includes('where t.user_id = $1')
    ) {
      const userId = toNumber(params[0]);
      let statusFilter: string[] | undefined;
      let taskId: number | undefined;

      if (sql.includes('v.download_status = any($2)')) {
        statusFilter = params[1];
      }

      if (sql.includes('and t.id = $3')) {
        taskId = toNumber(params[2]);
      } else if (sql.includes('and t.id = $2')) {
        taskId = toNumber(params[1]);
      }

      return {
        rows: this.listVodsForUser(userId, statusFilter, taskId),
        rowCount: this.listVodsForUser(userId, statusFilter, taskId).length,
      };
    }

    if (
      sql.includes('select count(*) as total')
      && sql.includes('from vods v')
      && sql.includes('join tasks t on v.task_id = t.id')
      && sql.includes('where t.user_id = $1')
      && sql.includes('v.download_status = any($2)')
      && !sql.includes('group by')
    ) {
      const userId = toNumber(params[0]);
      const statusFilter = params[1] as string[];
      const taskId = sql.includes('and t.id = $3') ? toNumber(params[2]) : undefined;
      const rows = sql.includes('select count(*) as total from vods v join tasks t on v.task_id = t.id where t.user_id = $1 and v.download_status = any($2)')
        ? this.getQueueItemsForUser(userId, statusFilter, Number.MAX_SAFE_INTEGER, 0)
        : this.getHistoryForUser(userId, statusFilter, Number.MAX_SAFE_INTEGER, 0, taskId);
      return { rows: [{ total: rows.total }], rowCount: 1 };
    }

    if (
      sql.includes('delete from vods using tasks t')
      && sql.includes("vods.download_status in ('completed', 'failed', 'cancelled')")
      && sql.includes('returning vods.id')
    ) {
      const deleted = this.deleteHistoryItemForUser(toNumber(params[0]), toNumber(params[1]));
      return deleted ? { rows: [{ id: toNumber(params[0]) }], rowCount: 1 } : emptyResult();
    }

    if (
      sql.includes('row_number() over')
      && sql.includes('from vods v')
      && sql.includes('join tasks t on v.task_id = t.id')
      && sql.includes('where t.user_id = $1')
      && sql.includes('v.download_status = any($2)')
    ) {
      const userId = toNumber(params[0]);
      const statusFilter = params[1] as string[];
      const limit = toNumber(params[2]);
      const offset = toNumber(params[3]);
      const queue = this.getQueueItemsForUser(userId, statusFilter, limit, offset);
      return { rows: queue.items, rowCount: queue.items.length };
    }

    if (
      sql.includes('select v.id, v.id as vod_id, v.task_id, v.title')
      && sql.includes('from vods v')
      && sql.includes('join tasks t on v.task_id = t.id')
      && sql.includes('where t.user_id = $1 and v.download_status = any($2)')
    ) {
      const userId = toNumber(params[0]);
      const statusFilter = params[1] as string[];
      let limitIndex = 2;
      let offsetIndex = 3;
      let taskId: number | undefined;

      if (sql.includes('and t.id = $3')) {
        taskId = toNumber(params[2]);
        limitIndex = 3;
        offsetIndex = 4;
      }

      const history = this.getHistoryForUser(
        userId,
        statusFilter,
        toNumber(params[limitIndex]),
        toNumber(params[offsetIndex]),
        taskId
      );
      return { rows: history.items, rowCount: history.items.length };
    }

    if (
      sql.includes("select count(case when v.download_status = 'pending' then 1 end)::integer as pending")
      && sql.includes('coalesce(sum(case when v.download_status = \'completed\' then v.file_size end), 0)::bigint as total_size_bytes')
    ) {
      const userId = toNumber(params[0]);
      const taskId = params.length > 1 ? toNumber(params[1]) : undefined;
      return { rows: [this.getQueueStatsForUser(userId, taskId)], rowCount: 1 };
    }

    if (
      sql.includes('select t.id, coalesce(t.storage_limit_gb, 0) as storage_limit_gb')
      && sql.includes('count(v.id)::integer as total_vods')
      && sql.includes('left join completed_vods cv on cv.vod_id = v.id')
      && sql.includes('where t.id = $1 and t.user_id = $2')
    ) {
      const stats = this.getMonitoringStatsForTask(toNumber(params[0]), toNumber(params[1]));
      return stats ? { rows: [stats], rowCount: 1 } : emptyResult();
    }

    if (sql === 'select 1 from tasks where id = $1 and user_id = $2') {
      const task = this.findTaskForUser(toNumber(params[0]), toNumber(params[1]));
      return task ? { rows: [{ '?column?': 1 }], rowCount: 1 } : emptyResult();
    }

    if (
      sql.includes('from task_performance_metrics tpm')
      && sql.includes('join tasks t on tpm.task_id = t.id')
      && sql.includes('where tpm.task_id = $1')
      && sql.includes('and t.user_id = $2')
      && sql.includes('and tpm.measured_at >= now() - $3::interval')
    ) {
      const rows = this.getPerformanceMetricsForTask(toNumber(params[0]), toNumber(params[1]), String(params[2]));
      return rows ? { rows, rowCount: rows.length } : emptyResult();
    }

    if (
      sql.includes("count(case when v.download_status in ('pending', 'queued') then 1 end)::integer as queue_items")
      && sql.includes('avg(case when cv.download_duration_seconds is not null')
    ) {
      const userId = toNumber(params[0]);
      const taskId = params.length > 1 ? toNumber(params[1]) : undefined;
      const estimate = this.getQueueEstimateForUser(userId, taskId);
      const durations = Array.from(this.completedVods.values()).map((vod) => vod.download_duration_seconds);
      const averageSeconds = durations.length > 0
        ? durations.reduce((sum, value) => sum + value, 0) / durations.length
        : 300;

      return {
        rows: [{
          queue_items: estimate.totalItems,
          avg_duration_seconds: averageSeconds,
        }],
        rowCount: 1,
      };
    }

    if (
      sql.includes('select v.id, v.retry_count, v.max_retries')
      && sql.includes('where v.id = $1 and t.user_id = $2')
      && sql.includes("and v.download_status = 'failed'")
    ) {
      const vod = this.findVodForUser(toNumber(params[0]), toNumber(params[1]));
      if (!vod || vod.download_status !== 'failed') {
        return emptyResult();
      }
      return {
        rows: [{
          id: vod.id,
          retry_count: vod.retry_count,
          max_retries: vod.max_retries,
        }],
        rowCount: 1,
      };
    }

    if (
      sql.includes("update vods set download_status = 'pending'")
      && sql.includes('error_message = null')
      && sql.includes('download_progress = 0')
      && sql.includes('returning *')
    ) {
      const resetRetryCount = sql.includes('retry_count = 0');
      const vod = this.retryFailedVodForUser(toNumber(params[0]), 1, resetRetryCount);
      return vod ? { rows: [vod], rowCount: 1 } : emptyResult();
    }

    if (
      sql.includes("update vods set resume_segment_index = $1, download_status = 'paused'")
      && sql.includes('where id = $2')
    ) {
      this.pauseDownload(toNumber(params[1]), toNumber(params[0]));
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.includes("update vods set download_status = 'paused'")
      && sql.includes("where download_status in ('downloading', 'queued')")
    ) {
      this.pauseQueuedAndDownloading();
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.includes('update vods v set download_status = \'queued\'')
      && sql.includes('from tasks t')
      && sql.includes("v.download_status = 'paused'")
      && sql.includes("v.pause_reason = 'task_paused'")
    ) {
      this.resumePausedDownloads();
      return { rows: [], rowCount: 1 };
    }

    if (
      sql.includes('delete from completed_vods')
      && sql.includes('where vod_id = $1 and task_id = $2')
    ) {
      const vodId = toNumber(params[0]);
      const existing = this.completedVods.delete(vodId);
      return { rows: [], rowCount: existing ? 1 : 0 };
    }

    if (
      sql.includes("update vods set status = 'queued'")
      && sql.includes("download_status = 'queued'")
      && sql.includes('retry_count = 0')
      && sql.includes('where id = $1')
    ) {
      const vod = this.redownloadVodForUser(toNumber(params[0]), 1)
        || this.redownloadVodForUser(toNumber(params[0]), 2);
      return vod ? { rows: [vod], rowCount: 1 } : emptyResult();
    }

    throw new Error(`Unhandled query in smoke harness: ${sql}`);
  }

  private getHistoryCompletedAt(vod: SmokeVod) {
    return this.completedVods.get(vod.id)?.completed_at ?? vod.downloaded_at ?? vod.updated_at;
  }

  private serializeTask(task: SmokeTask) {
    const monitoring = this.monitoring.get(task.id);
    return {
      ...clone(task),
      monitoring_status: monitoring?.status ?? task.monitoring_status,
      progress_percentage: monitoring?.progress_percentage ?? 0,
      monitoring_enabled: task.monitoring_enabled,
    };
  }

  private serializeVod(vod: SmokeVod, queuePosition?: number) {
    const task = this.tasks.get(vod.task_id);
    const channel = this.channels.get(vod.channel_id);
    const game = vod.game_id ? this.games.get(vod.game_id) : null;
    const completed = this.completedVods.get(vod.id);

    return {
      ...clone(vod),
      task_name: task?.name,
      task_user_id: task?.user_id,
      task_status: task?.status,
      channel_name: channel?.username,
      game_name: game?.name,
      actual_completed_at: completed?.completed_at ?? null,
      actual_file_size: completed?.file_size_bytes ?? null,
      download_speed_mbps: completed?.download_speed_mbps ?? null,
      download_duration_seconds: completed?.download_duration_seconds ?? null,
      queue_position: queuePosition ?? null,
    };
  }

  private sortByQueuePriority = (left: SmokeVod, right: SmokeVod) => {
    const priorityDelta = (priorityRank[left.download_priority] ?? 99) - (priorityRank[right.download_priority] ?? 99);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return left.created_at.localeCompare(right.created_at);
  };

  private findTaskForUser(taskId: number, userId: number) {
    const task = this.tasks.get(taskId);
    return task && task.user_id === userId ? task : null;
  }

  private findVodForUser(vodId: number, userId: number) {
    const vod = this.vods.get(vodId);
    if (!vod) {
      return null;
    }

    const task = this.tasks.get(vod.task_id);
    return task && task.user_id === userId ? vod : null;
  }

  private requireVod(vodId: number) {
    const vod = this.vods.get(vodId);
    if (!vod) {
      throw new Error(`Unknown VOD ${vodId}`);
    }
    return vod;
  }
}

class SmokeClient {
  constructor(private readonly store: SmokeStore) {}

  async query(queryText: string, params: any[] = []) {
    return this.store.handleQuery(queryText, params);
  }

  release() {}
}

class SmokePool {
  constructor(private readonly store: SmokeStore) {}

  async connect() {
    return new SmokeClient(this.store);
  }

  async query(queryText: string, params: any[] = []) {
    return this.store.handleQuery(queryText, params);
  }
}

export const createMockDownloadManager = (store: SmokeStore) => {
  const activeDownloads = new Map<number, any>();
  const activeVod = store.getActiveDownloadState();
  if (activeVod) {
    activeDownloads.set(activeVod.id, {
      vodId: activeVod.id,
      progress: {
        vodId: activeVod.id,
        segmentIndex: activeVod.current_segment ?? 0,
        totalSegments: activeVod.total_segments ?? 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        speed: activeVod.download_speed ?? 0,
        eta: activeVod.eta_seconds ?? 0,
        status: activeVod.download_status,
      },
    });
  }

  return {
    addToQueue: jest.fn(async (vodId: number, priority?: VodPriority) => {
      store.addToQueue(vodId, priority ?? 'normal');
    }),
    getQueueStatus: jest.fn(async () => store.getQueueStatusSummary()),
    retryFailedDownload: jest.fn(async (vodId: number) => {
      store.retryFailedDownloadDirect(vodId);
    }),
    cancelDownload: jest.fn(async (vodId: number) => {
      store.cancelDownloadDirect(vodId);
      activeDownloads.delete(vodId);
    }),
    getTaskDetails: jest.fn(async (taskId: number) => store.getTask(taskId)),
    executeTask: jest.fn(async (taskId: number) => {
      const task = store.getTask(taskId);
      if (task) {
        task.status = 'running';
        task.is_active = true;
        task.updated_at = iso(0);
      }
    }),
    startProcessing: jest.fn(async () => undefined),
    stopProcessing: jest.fn(async () => {
      activeDownloads.clear();
    }),
    getSystemResources: jest.fn(async () => ({
      memoryUsage: { total: 32_768, free: 20_480, processUsage: 256 },
      diskSpace: { total: 512_000, free: 256_000, available: 256_000 },
      cpu: { usage: 18, loadAverage: [0.3, 0.25, 0.2] },
    })),
    getMetrics: jest.fn(() => ({
      totalBytesDownloaded: 4_096,
      totalDownloads: 1,
      failedDownloads: 2,
      averageSpeed: 2.5,
      peakMemoryUsage: 512,
      startTime: FIXED_NOW,
    })),
    getActiveDownloads: jest.fn(() => activeDownloads),
  };
};

export const createSmokeHarness = () => {
  const store = new SmokeStore();
  const pool = new SmokePool(store);
  const downloadManager = createMockDownloadManager(store);

  return {
    store,
    pool,
    downloadManager,
  };
};
