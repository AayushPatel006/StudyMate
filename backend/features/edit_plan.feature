Feature: Stay in control of the suggestions (US-3, midterm scope)
  As a student, I want to review and edit the suggested schedule
  so that the planner works around my preferences.

  Background:
    Given today is Monday "2026-11-09" at "09:00"
    And I have a task "Quiz practice" due Friday that needs 3 hours
    And I am free Monday to Thursday from 6 PM to 9 PM

  Scenario: Moving a suggested session to a free time is accepted
    When I ask for a study plan
    And I move the first "Quiz practice" session to Thursday at 6 PM
    Then the change is accepted

  Scenario: Moving a session outside my free hours is refused
    When I ask for a study plan
    And I move the first "Quiz practice" session to Thursday at 10 PM
    Then the change is refused because "OUTSIDE_AVAILABILITY"
