@smoke
Feature: Home page smoke test
  A first-time visitor can load the site and reach the blog.

  Scenario: Visitor opens the home page and navigates to the blog
    Given I open "/"
    Then I see the site title
    And I see a visible "Blog" navigation link
    When I click the "Blog" navigation link
    Then I land on "/all"
    And I see at least one post link
