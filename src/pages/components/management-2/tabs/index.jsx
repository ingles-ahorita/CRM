import SegmentedTabs from "../segmented-tabs";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "closer", label: "Closer" },
  { id: "leads", label: "Leads" },
  { id: "setter", label: "Setter" },
];

export default function Tabs({ activeTab, onTabChange }) {
  return <SegmentedTabs items={TABS} activeId={activeTab} onChange={onTabChange} />;
}
