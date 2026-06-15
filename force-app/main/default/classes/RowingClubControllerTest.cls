@isTest
private class RowingClubControllerTest {

    // ─────────────────────────────────────────────────────────────────────────
    // Helpers
    // ─────────────────────────────────────────────────────────────────────────

    private static Boat__c insertBoat(String name, String status, String capacity) {
        Boat__c boat = new Boat__c(
            Name = name,
            Status__c = status,
            Capacity__c = capacity,
            Number_of_Oars__c = Integer.valueOf(capacity)
        );
        insert boat;
        return boat;
    }

    private static Rower__c insertRowerForCurrentUser(String rowerGroup) {
        Rower__c rower = new Rower__c(
            User__c = UserInfo.getUserId(),
            Group__c = rowerGroup,
            License_Number__c = 'LIC-TEST-001'
        );
        insert rower;
        return rower;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: getAvailableBoats
    // ─────────────────────────────────────────────────────────────────────────

    @isTest
    static void testGetAvailableBoats() {
        insertRowerForCurrentUser('Leisure');
        Boat__c availableBoat = insertBoat('Boat Alpha', 'Available', '4');
        insertBoat('Boat Beta', 'In Use', '4');   // should be excluded by status

        Test.startTest();
        List<Boat__c> results = RowingSessionController.getAvailableBoats(null, null, null);
        Test.stopTest();

        System.assert(!results.isEmpty(), 'Should return at least one available boat');
        Boolean foundAlpha = false;
        for (Boat__c b : results) {
            System.assertNotEquals('In Use', b.Status__c, 'In-use boats should not be returned');
            if (b.Id == availableBoat.Id) {
                foundAlpha = true;
            }
        }
        System.assert(foundAlpha, 'Available boat should be in results');
    }

    @isTest
    static void testGetAvailableBoatsWithCapacityFilter() {
        insertRowerForCurrentUser('Competition Junior');
        insertBoat('Boat 4 Seat', 'Available', '4');
        insertBoat('Boat 8 Seat', 'Available', '8');

        Test.startTest();
        List<Boat__c> results = RowingSessionController.getAvailableBoats(null, null, '4');
        Test.stopTest();

        for (Boat__c b : results) {
            System.assertEquals('4', b.Capacity__c, 'Only capacity-4 boats should be returned');
        }
    }

    @isTest
    static void testGetAvailableBoatsRestrictedGroupExclusion() {
        insertRowerForCurrentUser('Master');
        Boat__c restrictedBoat = new Boat__c(
            Name = 'Restricted Boat',
            Status__c = 'Available',
            Capacity__c = '2',
            Number_of_Oars__c = 4,
            Restricted_Groups__c = 'Master;Leisure'
        );
        insert restrictedBoat;

        Test.startTest();
        List<Boat__c> results = RowingSessionController.getAvailableBoats(null, null, null);
        Test.stopTest();

        for (Boat__c b : results) {
            System.assertNotEquals(restrictedBoat.Id, b.Id, 'Restricted boat should be excluded for the rower\'s group');
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: createSession
    // ─────────────────────────────────────────────────────────────────────────

    @isTest
    static void testCreateSession() {
        Rower__c currentRower = insertRowerForCurrentUser('Leisure');
        Boat__c boat = insertBoat('Scull One', 'Available', '2');

        // Create a second rower as explicit crew
        Rower__c crewRower = new Rower__c(
            License_Number__c = 'LIC-CREW-001',
            Group__c = 'Leisure'
        );
        insert crewRower;

        Date sessionDate = Date.today().addDays(1);

        Test.startTest();
        Id sessionId = RowingSessionController.createSession(boat.Id, 'Morning', sessionDate, new List<Id>{ crewRower.Id });
        Test.stopTest();

        System.assertNotEquals(null, sessionId, 'Session Id should be returned');

        Rowing_Session__c session = [SELECT Id, Status__c, Booked_By__c, Session_Type__c FROM Rowing_Session__c WHERE Id = :sessionId];
        System.assertEquals('In Progress', session.Status__c);
        System.assertEquals('Morning', session.Session_Type__c);
        System.assertEquals(currentRower.Id, session.Booked_By__c);

        // Booker is NOT auto-added as a crew member; only the explicitly passed rower is
        List<Session_Member__c> members = [SELECT Id, Rower__c FROM Session_Member__c WHERE Session__c = :sessionId];
        System.assertEquals(1, members.size(), 'Only the explicitly selected crew member should be created');
        System.assertEquals(crewRower.Id, members[0].Rower__c, 'The crew member should be the explicitly passed rower');

        // Boat should be marked In Use as soon as the session is booked
        Boat__c updatedBoat = [SELECT Status__c FROM Boat__c WHERE Id = :boat.Id];
        System.assertEquals('In Use', updatedBoat.Status__c, 'Boat should be In Use after booking');
    }

    @isTest
    static void testCreateSessionNoCrew() {
        // Booking with an empty crew list — booker is NOT auto-added, so 0 members expected
        insertRowerForCurrentUser('Master');
        Boat__c boat = insertBoat('Single Scull', 'Available', '1');

        Test.startTest();
        Id sessionId = RowingSessionController.createSession(boat.Id, 'Afternoon', Date.today(), new List<Id>());
        Test.stopTest();

        List<Session_Member__c> members = [SELECT Id FROM Session_Member__c WHERE Session__c = :sessionId];
        System.assertEquals(0, members.size(), 'No crew members should be created when none are explicitly passed');

        Boat__c updatedBoat = [SELECT Status__c FROM Boat__c WHERE Id = :boat.Id];
        System.assertEquals('In Use', updatedBoat.Status__c, 'Boat should be In Use even when no crew is specified');
    }

    @isTest
    static void testCreateSessionDuplicateCrewDeduped() {
        // Passing the same rower Id twice should only create one Session_Member__c
        insertRowerForCurrentUser('Master');
        Boat__c boat = insertBoat('Double Scull', 'Available', '2');

        Rower__c crewRower = new Rower__c(License_Number__c = 'LIC-DUP-001', Group__c = 'Master');
        insert crewRower;

        Test.startTest();
        Id sessionId = RowingSessionController.createSession(
            boat.Id, 'Afternoon', Date.today(),
            new List<Id>{ crewRower.Id, crewRower.Id }
        );
        Test.stopTest();

        List<Session_Member__c> members = [SELECT Id FROM Session_Member__c WHERE Session__c = :sessionId];
        System.assertEquals(1, members.size(), 'Duplicate crew rower Id should be de-duped to a single member record');

        Boat__c updatedBoat = [SELECT Status__c FROM Boat__c WHERE Id = :boat.Id];
        System.assertEquals('In Use', updatedBoat.Status__c, 'Boat should be In Use after booking');
    }

    @isTest
    static void testCancelSession() {
        insertRowerForCurrentUser('Leisure');
        Boat__c boat = insertBoat('Kayak', 'Available', '1');

        Test.startTest();
        Id sessionId = RowingSessionController.createSession(boat.Id, 'Morning', Date.today(), new List<Id>());
        // Boat should now be In Use
        Boat__c inUse = [SELECT Status__c FROM Boat__c WHERE Id = :boat.Id];
        System.assertEquals('In Use', inUse.Status__c);

        // Cancel the booking
        RowingSessionController.cancelSession(sessionId);
        Test.stopTest();

        Rowing_Session__c cancelled = [SELECT Status__c FROM Rowing_Session__c WHERE Id = :sessionId];
        System.assertEquals('Cancelled', cancelled.Status__c, 'Session should be Cancelled');

        Boat__c released = [SELECT Status__c FROM Boat__c WHERE Id = :boat.Id];
        System.assertEquals('Available', released.Status__c, 'Boat should be Available again after cancellation');
    }

    @isTest
    static void testCancelCompletedSessionThrows() {
        insertRowerForCurrentUser('Leisure');
        Boat__c boat = insertBoat('Kayak 2', 'Available', '1');

        Rowing_Session__c session = new Rowing_Session__c(
            Boat__c = boat.Id,
            Session_Type__c = 'Morning',
            Session_Date__c = Date.today(),
            Status__c = 'Completed'
        );
        insert session;

        Test.startTest();
        Boolean exceptionThrown = false;
        try {
            RowingSessionController.cancelSession(session.Id);
        } catch (AuraHandledException e) {
            exceptionThrown = true;
        }
        Test.stopTest();

        System.assert(exceptionThrown, 'AuraHandledException should be thrown when cancelling a Completed session');
        Rowing_Session__c unchanged = [SELECT Status__c FROM Rowing_Session__c WHERE Id = :session.Id];
        System.assertEquals('Completed', unchanged.Status__c, 'Session status should remain Completed');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: startSession and endSession
    // ─────────────────────────────────────────────────────────────────────────

    @isTest
    static void testStartAndEndSession() {
        insertRowerForCurrentUser('Leisure');
        Boat__c boat = insertBoat('Eight', 'Available', '8');

        Rowing_Session__c session = new Rowing_Session__c(
            Boat__c = boat.Id,
            Session_Type__c = 'Morning',
            Session_Date__c = Date.today(),
            Status__c = 'Booked'
        );
        insert session;

        Test.startTest();
        RowingSessionController.startSession(session.Id);

        Rowing_Session__c updatedSession = [SELECT Status__c, Start_Time__c FROM Rowing_Session__c WHERE Id = :session.Id];
        System.assertEquals('In Progress', updatedSession.Status__c);
        System.assertNotEquals(null, updatedSession.Start_Time__c, 'Start time should be set');

        Boat__c updatedBoat = [SELECT Status__c FROM Boat__c WHERE Id = :boat.Id];
        System.assertEquals('In Use', updatedBoat.Status__c, 'Boat status should be In Use after session starts');

        // Now end the session
        RowingSessionController.endSession(session.Id);
        Test.stopTest();

        Rowing_Session__c completedSession = [SELECT Status__c, End_Time__c FROM Rowing_Session__c WHERE Id = :session.Id];
        System.assertEquals('Completed', completedSession.Status__c);
        System.assertNotEquals(null, completedSession.End_Time__c, 'End time should be set');

        Boat__c availableBoat = [SELECT Status__c FROM Boat__c WHERE Id = :boat.Id];
        System.assertEquals('Available', availableBoat.Status__c, 'Boat should be Available after session ends');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: reportIssue
    // ─────────────────────────────────────────────────────────────────────────

    @isTest
    static void testReportIssue() {
        insertRowerForCurrentUser('Leisure');
        Boat__c boat = insertBoat('Coxed Four', 'Available', '4');

        Rowing_Session__c session = new Rowing_Session__c(
            Boat__c = boat.Id,
            Session_Type__c = 'Morning',
            Session_Date__c = Date.today(),
            Status__c = 'In Progress'
        );
        insert session;

        Test.startTest();
        BoatIssueController.reportIssue(session.Id, boat.Id, 'Hull Damage', 'Hull crack near stern', 'Critical');
        Test.stopTest();

        List<Boat_Issue__c> issues = [SELECT Id, Severity__c, Resolved__c, Description__c FROM Boat_Issue__c WHERE Boat__c = :boat.Id];
        System.assertEquals(1, issues.size(), 'One issue should have been created');
        System.assertEquals('Critical', issues[0].Severity__c);
        System.assertEquals(false, issues[0].Resolved__c);
        System.assertEquals('Hull crack near stern', issues[0].Description__c);

        Boat__c updatedBoat = [SELECT Status__c FROM Boat__c WHERE Id = :boat.Id];
        System.assertEquals('Under Repair', updatedBoat.Status__c, 'Critical issue should put boat Under Repair');
    }

    @isTest
    static void testReportIssueNonCritical() {
        insertRowerForCurrentUser('Leisure');
        Boat__c boat = insertBoat('Pair', 'Available', '2');

        Rowing_Session__c session = new Rowing_Session__c(
            Boat__c = boat.Id,
            Session_Type__c = 'Morning',
            Session_Date__c = Date.today(),
            Status__c = 'In Progress'
        );
        insert session;

        Test.startTest();
        BoatIssueController.reportIssue(session.Id, boat.Id, 'Other', 'Missing foot stretcher nut', 'Minor');
        Test.stopTest();

        Boat__c updatedBoat = [SELECT Status__c FROM Boat__c WHERE Id = :boat.Id];
        System.assertNotEquals('Under Repair', updatedBoat.Status__c, 'Non-critical issue should not change boat status to Under Repair');

        List<Boat_Issue__c> issues = [SELECT Id FROM Boat_Issue__c WHERE Boat__c = :boat.Id];
        System.assertEquals(1, issues.size(), 'Issue record should be created');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: getCurrentRower
    // ─────────────────────────────────────────────────────────────────────────

    @isTest
    static void testGetCurrentRower() {
        Rower__c rower = insertRowerForCurrentUser('Competition Junior');

        Test.startTest();
        Rower__c result = RowingSessionController.getCurrentRower();
        Test.stopTest();

        System.assertNotEquals(null, result, 'Current rower should be found');
        System.assertEquals(rower.Id, result.Id);
        System.assertEquals('Competition Junior', result.Group__c);
    }

    @isTest
    static void testGetCurrentRowerNotFound() {
        // No Rower__c inserted for current user

        Test.startTest();
        Rower__c result = RowingSessionController.getCurrentRower();
        Test.stopTest();

        System.assertEquals(null, result, 'Should return null when no rower linked to current user');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: getFleetStatus
    // ─────────────────────────────────────────────────────────────────────────

    @isTest
    static void testGetFleetStatus() {
        insertRowerForCurrentUser('Leisure');
        Boat__c boat1 = insertBoat('Fleet Boat 1', 'Available', '4');
        Boat__c boat2 = insertBoat('Fleet Boat 2', 'In Use', '8');

        Date targetDate = Date.today();

        Rowing_Session__c session = new Rowing_Session__c(
            Boat__c = boat2.Id,
            Session_Type__c = 'Morning',
            Session_Date__c = targetDate,
            Status__c = 'In Progress'
        );
        insert session;

        Test.startTest();
        List<FleetDashboardController.BoatStatus> results = FleetDashboardController.getFleetStatus(targetDate, 'All');
        Test.stopTest();

        System.assert(!results.isEmpty(), 'Fleet status should return results');

        Boolean foundBoat1 = false;
        Boolean foundBoat2WithSession = false;
        for (FleetDashboardController.BoatStatus bs : results) {
            System.assertNotEquals(null, bs.boat, 'Boat should not be null');
            System.assertNotEquals(null, bs.openIssueCount, 'Open issue count should not be null');
            System.assertNotEquals(null, bs.crewNames, 'Crew names list should not be null');
            if (bs.boat.Id == boat1.Id) {
                foundBoat1 = true;
            }
            if (bs.boat.Id == boat2.Id && bs.session != null) {
                foundBoat2WithSession = true;
                System.assertEquals(session.Id, bs.session.Id);
            }
        }
        System.assert(foundBoat1, 'Boat 1 should appear in fleet status');
        System.assert(foundBoat2WithSession, 'Boat 2 should appear with linked session');
    }

    @isTest
    static void testGetFleetStatusWithSessionTypeFilter() {
        insertRowerForCurrentUser('Master');
        Boat__c boat = insertBoat('Race Shell', 'Available', '1');
        Date targetDate = Date.today();

        Rowing_Session__c racingSession = new Rowing_Session__c(
            Boat__c = boat.Id,
            Session_Type__c = 'Afternoon',
            Session_Date__c = targetDate,
            Status__c = 'Booked'
        );
        insert racingSession;

        Test.startTest();
        List<FleetDashboardController.BoatStatus> racingResults = FleetDashboardController.getFleetStatus(targetDate, 'Afternoon');
        List<FleetDashboardController.BoatStatus> trainingResults = FleetDashboardController.getFleetStatus(targetDate, 'Morning');
        Test.stopTest();

        // The afternoon session should be associated with the boat in racingResults
        Boolean sessionFoundInRacing = false;
        for (FleetDashboardController.BoatStatus bs : racingResults) {
            if (bs.boat.Id == boat.Id && bs.session != null) {
                sessionFoundInRacing = true;
            }
        }
        System.assert(sessionFoundInRacing, 'Afternoon session should be found when filtering by Afternoon');

        // When filtering by Morning, no session should be linked to this boat
        for (FleetDashboardController.BoatStatus bs : trainingResults) {
            if (bs.boat.Id == boat.Id) {
                System.assertEquals(null, bs.session, 'No morning session should be linked when filtering by Morning');
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test: setBoatStatus
    // ─────────────────────────────────────────────────────────────────────────

    @isTest
    static void testSetBoatStatus() {
        Boat__c boat = insertBoat('Status Test Boat', 'Available', '4');

        Test.startTest();
        FleetDashboardController.setBoatStatus(boat.Id, 'Under Repair');
        Test.stopTest();

        Boat__c updated = [SELECT Status__c FROM Boat__c WHERE Id = :boat.Id];
        System.assertEquals('Under Repair', updated.Status__c);
    }

    @isTest
    static void testSetBoatStatusInvalidThrows() {
        Boat__c boat = insertBoat('Invalid Status Boat', 'Available', '4');

        Test.startTest();
        try {
            FleetDashboardController.setBoatStatus(boat.Id, 'Sunken');
            System.assert(false, 'Expected AuraHandledException for invalid status');
        } catch (AuraHandledException e) {
            System.assert(e.getMessage().contains('Invalid boat status'), 'Exception message should describe the invalid status');
        }
        Test.stopTest();
    }
}
