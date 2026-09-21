@extended
Feature: Not found
  An unknown URL serves the intended 404 experience.

  Scenario: Visitor follows a broken link
    Given I open "/this-page-does-not-exist"
    Then I see the not-found page
    And the response status is 404
