/** Shared wrapper for every Admin page: the form-width rules in globals.css (.admin-area) hang off this. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-area">{children}</div>;
}
