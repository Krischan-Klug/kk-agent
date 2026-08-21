import styled from "styled-components";

const McpCardList = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-lg);

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

export default McpCardList;
