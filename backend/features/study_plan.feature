Feature: Create a realistic study plan (US-1)
  As a student, I want to enter my tasks, deadlines and available time
  so that I get a study plan I can actually follow.

  Background:
    Given today is Monday "2026-11-09" at "09:00"

  Scenario: Plan fits before the deadline
    Given I have a task "ML assignment" due Friday that needs 4 hours
    And I am free Monday to Thursday from 6 PM to 9 PM
    When I ask for a study plan
    Then all sessions for "ML assignment" are before Friday
    And no session is outside my free hours
    And "ML assignment" has 4 hours scheduled

  Scenario: Not enough time is reported instead of an invalid plan
    Given I have a task "Capstone report" due Tuesday that needs 10 hours
    And I am free Monday to Thursday from 6 PM to 9 PM
    When I ask for a study plan
    Then I am warned that "Capstone report" does not fit before its deadline
    And no session is outside my free hours

  Scenario: The planner still works when the AI is unavailable
    Given I have a task "Quiz practice" due Thursday that needs 2 hours
    And I am free Monday to Thursday from 6 PM to 9 PM
    And the AI planning service is rate limited
    When I ask for a study plan
    Then the plan is marked as generated in fallback mode
    And "Quiz practice" has 2 hours scheduled

  Scenario: Invalid AI suggestions never reach the student
    Given I have a task "Project slides" due Wednesday that needs 2 hours
    And I am free Monday to Thursday from 6 PM to 9 PM
    And the AI proposes a session for "Project slides" on Friday at 7 PM
    When I ask for a study plan
    Then no session is outside my free hours
    And all sessions for "Project slides" are before Wednesday
