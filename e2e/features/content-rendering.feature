@extended
Feature: Content rendering
  Committed posts render code highlighting and rich content in the browser.

  # Mermaid diagrams are intentionally not covered: in the current production
  # build the astro-mermaid client script is missing from the page bundle, so
  # diagrams never render (found by an earlier draft of this suite). KaTeX is
  # rendered during the static build and is covered instead.

  Scenario: Visitor sees syntax-highlighted code in a committed post
    Given I open "/fe/2025/09/09/tetris-ai"
    Then I see the heading "Using Mini-Max Algorithm to Play Tetris 🎮"
    And I see highlighted code

  Scenario: Visitor sees rendered math formulas
    Given I open "/book/2021/02/10/matrix"
    Then I see the heading "矩阵"
    And I see rendered math
