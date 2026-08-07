import type { SkillNode } from '../types/models';
import { useAppStore } from '../store/useAppStore';
import { NodeNotes } from './NodeNotes';
import { Modal } from './Modal';

interface QuickNoteModalProps {
  node: SkillNode;
  onClose: () => void;
}

/** Writing a note without the detour through the node detail. */
export function QuickNoteModal({ node, onClose }: QuickNoteModalProps) {
  const area = useAppStore((s) => s.areas.find((a) => a.id === node.areaId));

  return (
    <Modal title={`📝 ${node.title}`} onClose={onClose}>
      <NodeNotes node={node} color={area?.color ?? '#38bdf8'} autoFocus />
    </Modal>
  );
}
