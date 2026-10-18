import type { Announcement, Role } from "@prisma/client";
import { ROLE_LABEL } from "@/lib/roles";
import { Badge, Empty, formatDate } from "./ui";

type Item = Announcement & { author: { name: string; role: Role }; school: { name: string } };

export function AnnouncementList({ items, actions }: { items: Item[]; actions?: (a: Item) => React.ReactNode }) {
  if (items.length === 0) return <Empty>No announcements yet.</Empty>;
  return (
    <ul className="divide-y divide-slate-100">
      {items.map((a) => (
        <li key={a.id} className="py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{a.title}</span>
            <Badge tone="blue">{a.audience.toLowerCase()}</Badge>
            <span className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              {a.author.name} ({ROLE_LABEL[a.author.role]}) · {a.school.name} · {formatDate(a.createdAt)}
              {actions?.(a)}
            </span>
          </div>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{a.body}</p>
        </li>
      ))}
    </ul>
  );
}
