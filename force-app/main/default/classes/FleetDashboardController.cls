public with sharing class FleetDashboardController {

    public class BoatStatus {
        @AuraEnabled public Boat__c boat { get; set; }
        @AuraEnabled public Rowing_Session__c session { get; set; }
        @AuraEnabled public Integer openIssueCount { get; set; }
        @AuraEnabled public List<String> crewNames { get; set; }
    }

    @AuraEnabled(cacheable=true)
    public static List<BoatStatus> getFleetStatus(Date selectedDate, String sessionType) {
        // 1. Query all boats
        List<Boat__c> boats = [
            SELECT Id, Name, Capacity__c, Number_of_Oars__c, Status__c, Notes__c
            FROM Boat__c
        ];

        Set<Id> boatIds = new Set<Id>();
        Map<Id, Boat__c> boatMap = new Map<Id, Boat__c>();
        for (Boat__c b : boats) {
            boatIds.add(b.Id);
            boatMap.put(b.Id, b);
        }

        // 2. Query sessions for the selected date and session type
        List<Rowing_Session__c> sessions;
        if (sessionType == 'All' || String.isBlank(sessionType)) {
            sessions = [
                SELECT Id, Boat__c, Booked_By__c, Session_Type__c, Status__c, Start_Time__c, End_Time__c
                FROM Rowing_Session__c
                WHERE Session_Date__c = :selectedDate
            ];
        } else {
            sessions = [
                SELECT Id, Boat__c, Booked_By__c, Session_Type__c, Status__c, Start_Time__c, End_Time__c
                FROM Rowing_Session__c
                WHERE Session_Date__c = :selectedDate
                AND Session_Type__c = :sessionType
            ];
        }

        Set<Id> sessionIds = new Set<Id>();
        Map<Id, Rowing_Session__c> boatToSessionMap = new Map<Id, Rowing_Session__c>();
        for (Rowing_Session__c s : sessions) {
            sessionIds.add(s.Id);
            // Prefer an 'In Progress' session over any other status for the same boat
            if (!boatToSessionMap.containsKey(s.Boat__c)) {
                boatToSessionMap.put(s.Boat__c, s);
            } else if (s.Status__c == 'In Progress') {
                boatToSessionMap.put(s.Boat__c, s);
            }
        }

        // 3. Query session members for crew names
        Map<Id, List<String>> sessionCrewNamesMap = new Map<Id, List<String>>();
        if (!sessionIds.isEmpty()) {
            List<Session_Member__c> members = [
                SELECT Id, Session__c, Rower__r.User__r.Name
                FROM Session_Member__c
                WHERE Session__c IN :sessionIds
            ];
            for (Session_Member__c m : members) {
                if (!sessionCrewNamesMap.containsKey(m.Session__c)) {
                    sessionCrewNamesMap.put(m.Session__c, new List<String>());
                }
                if (m.Rower__r != null && m.Rower__r.User__r != null && String.isNotBlank(m.Rower__r.User__r.Name)) {
                    sessionCrewNamesMap.get(m.Session__c).add(m.Rower__r.User__r.Name);
                }
            }
        }

        // 4. Query open issues per boat
        Map<Id, Integer> boatOpenIssueCountMap = new Map<Id, Integer>();
        if (!boatIds.isEmpty()) {
            List<AggregateResult> issueResults = [
                SELECT Boat__c, COUNT(Id) issueCount
                FROM Boat_Issue__c
                WHERE Boat__c IN :boatIds
                AND Resolved__c = false
                GROUP BY Boat__c
            ];
            for (AggregateResult ar : issueResults) {
                boatOpenIssueCountMap.put((Id) ar.get('Boat__c'), (Integer) ar.get('issueCount'));
            }
        }

        // 5. Build the result list
        List<BoatStatus> result = new List<BoatStatus>();
        for (Boat__c boat : boats) {
            BoatStatus bs = new BoatStatus();
            bs.boat = boat;

            Rowing_Session__c linkedSession = boatToSessionMap.get(boat.Id);
            bs.session = linkedSession;

            bs.openIssueCount = boatOpenIssueCountMap.containsKey(boat.Id)
                ? boatOpenIssueCountMap.get(boat.Id)
                : 0;

            if (linkedSession != null && sessionCrewNamesMap.containsKey(linkedSession.Id)) {
                bs.crewNames = sessionCrewNamesMap.get(linkedSession.Id);
            } else {
                bs.crewNames = new List<String>();
            }

            result.add(bs);
        }

        return result;
    }

    @AuraEnabled
    public static void setBoatStatus(Id boatId, String status) {
        Set<String> validStatuses = new Set<String>{'Available', 'In Use', 'Under Repair'};
        if (!validStatuses.contains(status)) {
            throw new AuraHandledException('Invalid boat status: ' + status + '. Must be one of: Available, In Use, Under Repair.');
        }
        try {
            Boat__c boat = new Boat__c(Id = boatId, Status__c = status);
            update boat;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}
