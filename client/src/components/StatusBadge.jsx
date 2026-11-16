// Plain-English labels for internal status codes.
export const STATUS_LABELS = {
  NOT_SUBMITTED: 'Not Submitted', SUBMITTED: 'Submitted', UNDER_REVIEW: 'Under Review', CHANGES_REQUIRED: 'Changes Required',
  APPROVED: 'Approved', REJECTED: 'Rejected', PLANNED: 'Planned', REGISTRATION_OPEN: 'Registration Open',
  REGISTRATION_CLOSED: 'Registration Closed', EXAM_ONGOING: 'Examination Ongoing', RESULTS_PROCESSING: 'Results Processing', COMPLETED: 'Completed',
};
const TONE = { APPROVED: 'bg-green-50 text-green-800', COMPLETED: 'bg-green-50 text-green-800', REJECTED: 'bg-red-50 text-red-800',
  CHANGES_REQUIRED: 'bg-amber-50 text-amber-800', UNDER_REVIEW: 'bg-blue-50 text-blue-800', SUBMITTED: 'bg-blue-50 text-blue-800', REGISTRATION_OPEN: 'bg-teal/10 text-teal' };

export default function StatusBadge({ status }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[status] || 'bg-page text-slate'}`}>{STATUS_LABELS[status] || status}</span>;
}
