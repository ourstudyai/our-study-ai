'use client';

import InfoTip from '@/components/admin/InfoTip';

const HELP: Record<string, { todo: string; means: string }> = {
  uploads: {
    todo: 'Open a year, tick the files, pick the semester and course, then Approve & sort. Delete anything that is junk.',
    means: 'Sorted files move to the OCR Queue. Until then students can already browse them under Library > Unsorted, marked Unverified. The AI does not use them.',
  },
  ocrqueue: {
    todo: 'Tick the sorted files and send them to OCR. Files already sent show their progress.',
    means: 'OCR reads the text out of each file. When it finishes, the file moves to Pending for your review.',
  },
  pending: {
    todo: 'Open a file, check the text and details, then approve it or quarantine it.',
    means: 'Approve with indexing: it appears in the Library and the AI can use it. Approve without indexing: saved but hidden. Quarantine: hidden from students and the AI.',
  },
  approved: {
    todo: 'Open a material to re-index it, change its course, quarantine it or delete it. To find files taken out of the Library, choose "Removed from Library" in the filter, then tap "Put back in Library".',
    means: 'Quarantine hides it but keeps it. Delete removes the file, its text and its indexed pieces for good and cannot be undone. Removing a file from the Library hides it from students, course pages, chat and AI search, but it stays here as approved, fully intact. Putting it back shows it again everywhere.',
  },
  quarantined: {
    todo: 'Open a file to see its details and decide what to do with it.',
    means: 'Quarantined files are hidden from students and from the AI.',
  },
  resurrection: {
    todo: 'These files failed text reading. Open the list and use Retry OCR on each.',
    means: 'A retry sends the file through OCR again. A file that keeps failing is probably unreadable or too poorly scanned.',
  },
  courses: {
    todo: 'Add or edit the courses: name, code, department, year and semester.',
    means: 'The Library headings, file names and course pages are built from these details, so keep them correct.',
  },
  coverage: {
    todo: 'Look for courses with little or no material.',
    means: 'A course with few indexed materials gives the AI less to answer from. Use this to see where more files are needed.',
  },
  assignments: {
    todo: 'Add or update assignments for a course.',
    means: 'Students see these on their course pages.',
  },
  timetables: {
    todo: 'Upload or replace the timetable for a department.',
    means: 'Students see the newest file you upload for that department.',
  },
  users: {
    todo: 'Find a user to see or change their role.',
    means: 'Roles decide what a person can do. Admin roles can approve, sort and delete materials.',
  },
  reports: {
    todo: 'Read the reports sent in by students and deal with them.',
    means: 'Reports are how students flag problems with materials or answers.',
  },
  analytics: {
    todo: 'Read the usage figures.',
    means: 'Only the chief admin sees this tab.',
  },
};

export default function TabHelp({ tab }: { tab: string }) {
  const h = HELP[tab];
  if (!h) return null;
  return <div style={{ padding: '0 16px' }}><InfoTip todo={h.todo} means={h.means} /></div>;
}
