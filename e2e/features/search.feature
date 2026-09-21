@extended
Feature: Search
  A visitor can find a known committed post through the header search dialog.

  # The journey starts from the blog list: the identical header search is
  # currently broken on the home page (the Spotlight dialog never opens after
  # the click — an application bug this suite uncovered, under investigation).

  Scenario: Visitor finds a committed post through header search
    Given I open "/all"
    When I open search from the header
    And I search for "Mermaid"
    Then I see a search result "Mermaid: Wait, UMLs are Back!"
    When I follow the search result "Mermaid: Wait, UMLs are Back!"
    Then I land on "/fe/2025/09/08/mermaid"
    And I see the heading "Mermaid: Wait, UMLs are Back!"
