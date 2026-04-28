import styled from "styled-components";

const McpCardGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-lg);

  @media (max-width: 1400px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 1100px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

export default McpCardGrid;
