# Mixpanel analytics e2e. The token is baked in at build time, so there are two builds:
#
#   pnpm test:e2e                -> normal build (no token); runs @analytics-off with the rest
#   pnpm test:e2e:analytics-on   -> builds with PUBLIC_MIXPANEL_TOKEN=e2e-test-token and
#                                   PUBLIC_MIXPANEL_API_HOST=http://127.0.0.1:4321/__mp,
#                                   runs @analytics-on
#
# Mixpanel requests are intercepted with page.route and fulfilled with {"status":1};
# the real network is never used. The default `pnpm test:e2e` build has no token, so it
# excludes @analytics-on via test:e2e:run; run those with pnpm test:e2e:analytics-on.
Feature: Mixpanel analytics and consent
  Analytics only loads when configured and only sends data after the visitor allows it.

  @smoke @analytics-off
  Scenario: Without a token nothing is sent and no banner is shown
    Given I open "/" with Mixpanel intercepted
    And I wait for analytics to settle
    Then the analytics consent banner is not visible
    When I open the fixture post
    And I wait for analytics to settle
    Then no request goes to a mixpanel.com host
    And the analytics consent banner is not visible

  @smoke @analytics-on
  Scenario: Before consent nothing is sent, then Allow sends a page view
    Given I open "/" with Mixpanel intercepted
    Then the analytics consent banner is visible
    When I wait for analytics to settle
    Then no Mixpanel track or engage request has been sent
    When I click "Allow" on the consent banner
    Then a Mixpanel track request with a page view event is sent
    And the analytics consent banner is not visible
    And the stored analytics consent is "granted"
    When I reload the page
    Then the analytics consent banner is not visible

  @analytics-on
  Scenario: With consent, reading a post to the end tracks Post Read; declining stops events
    Given the visitor has allowed analytics
    And I open the fixture post
    And the analytics consent banner is not visible
    When I scroll to the bottom of the article
    And I wait for analytics to settle
    Then a Mixpanel "post_read" event with depth 100 is sent
    When I open "/privacy" with Mixpanel intercepted
    And I choose "Don't allow" in the privacy analytics preferences
    Then the stored analytics consent is "denied"
    When I count the Mixpanel events so far
    And I open the fixture post
    And I scroll to the bottom of the article
    And I wait for analytics to settle
    Then no further Mixpanel events have been sent
