@extended
Feature: Desktop navigation
  A visitor on a desktop screen can browse from the home page into a post
  and find their way back.

  Scenario: Visitor reads a post from the blog list
    Given I open "/"
    When I click the "Blog" navigation link
    Then I land on "/all"
    And I see at least one post link
    When I open the first post
    Then I see a post heading
    And I see post content
    When I go back
    Then I land on "/all"
