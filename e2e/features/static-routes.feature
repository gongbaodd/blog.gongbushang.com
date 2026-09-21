@extended
Feature: Static routes
  Every promoted route serves real page content instead of the 404 page.

  Scenario: Lab lists portfolio posts
    Given I open "/lab"
    Then I see at least one post link
    And I do not see the not-found page

  Scenario: World serves the travel page
    Given I open "/world"
    Then I see the page title "World"
    And I do not see the not-found page

  Scenario: Archive serves the year page
    Given I open "/year"
    Then I see the page title "Archive"
    And I do not see the not-found page

  Scenario: CV renders the bento overview
    Given I open "/cv"
    Then I see "Save your files"
    And I do not see the not-found page

  Scenario: About introduces the author
    Given I open "/about"
    Then I see the heading "Hi, I’m Gong 👋"
    And I do not see the not-found page
