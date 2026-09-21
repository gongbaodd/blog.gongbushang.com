@extended @mobile
Feature: Mobile navigation
  A visitor on a phone-sized screen can open the header drawer and navigate.

  Scenario: Visitor opens the mobile menu and navigates to World
    Given I open "/"
    When I open the navigation menu
    And I follow "World" in the navigation drawer
    Then I land on "/world"
    And I do not see the not-found page
