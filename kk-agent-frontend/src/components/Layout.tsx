import Sidebar from "./Sidebar";
import { LayoutWrapper, MainContent } from "./Layout.styled";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <LayoutWrapper>
      <Sidebar />
      <MainContent>{children}</MainContent>
    </LayoutWrapper>
  );
}
