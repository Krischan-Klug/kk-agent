import styled from "styled-components";

export const LayoutWrapper = styled.div`
  display: flex;
  height: 100%;
  min-height: 0;
`;

export const MainContent = styled.main`
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: var(--space-lg);
`;

export const PageBody = styled.div`
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding-right: var(--space-lg);

  @media (max-width: 900px) {
    padding-right: 0;
  }
`;
