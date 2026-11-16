import PageHeader from '../components/PageHeader';

// Only reached by typing an address that does not exist; real pages are linked from the menu.
export default function ComingSoon() {
  return <PageHeader title="Page not found" description="This page does not exist. Use the menu to find what you need." />;
}
