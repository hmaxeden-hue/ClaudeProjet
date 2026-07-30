import type { Resource, ResourceType } from '../types/models';

export const RESOURCE_TYPE_META: Record<
  ResourceType,
  { label: string; icon: string }
> = {
  book: { label: 'Buch', icon: '📖' },
  video: { label: 'Video', icon: '🎬' },
  course: { label: 'Kurs', icon: '🎓' },
  other: { label: 'Sonstiges', icon: '🔗' },
};

export const RESOURCE_STATUS_LABEL: Record<Resource['status'], string> = {
  todo: 'Offen',
  in_progress: 'In Arbeit',
  done: 'Fertig',
};

export const RESOURCE_TYPES = Object.keys(RESOURCE_TYPE_META) as ResourceType[];

export const RESOURCE_STATUSES = Object.keys(
  RESOURCE_STATUS_LABEL,
) as Resource['status'][];
