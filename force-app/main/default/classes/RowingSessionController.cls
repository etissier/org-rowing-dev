public with sharing class RowingSessionController {

    @AuraEnabled(cacheable=true)
    public static List<Boat__c> getAvailableBoats(String sessionType, Date sessionDate, Integer capacity) {
        List<Boat__c> boats;

        if (capacity != null) {
            boats = [
                SELECT Id, Name, Capacity__c, Number_of_Oars__c, Status__c, Restricted_Groups__c
                FROM Boat__c
                WHERE Status__c = 'Available'
                AND Capacity__c = :capacity
            ];
        } else {
            boats = [
                SELECT Id, Name, Capacity__c, Number_of_Oars__c, Status__c, Restricted_Groups__c
                FROM Boat__c
                WHERE Status__c = 'Available'
            ];
        }

        // Get boat IDs already booked for this date/session
        Set<Id> bookedBoatIds = new Set<Id>();
        if (sessionDate != null && sessionType != null) {
            for (Rowing_Session__c s : [
                SELECT Boat__c FROM Rowing_Session__c
                WHERE Session_Date__c = :sessionDate
                AND Session_Type__c = :sessionType
                AND Status__c IN ('Booked', 'In Progress')
            ]) {
                bookedBoatIds.add(s.Boat__c);
            }
        }

        Rower__c currentRower = getCurrentRower();
        String rowerGroup = (currentRower != null && String.isNotBlank(currentRower.Group__c))
            ? currentRower.Group__c
            : null;

        List<Boat__c> filteredBoats = new List<Boat__c>();
        for (Boat__c boat : boats) {
            // Exclude boats already booked for this date/session type
            if (bookedBoatIds.contains(boat.Id)) {
                continue;
            }

            if (rowerGroup == null) {
                filteredBoats.add(boat);
            } else if (String.isBlank(boat.Restricted_Groups__c)) {
                filteredBoats.add(boat);
            } else {
                List<String> restrictedGroups = boat.Restricted_Groups__c.split(';');
                Boolean isRestricted = false;
                for (String groupValue : restrictedGroups) {
                    if (groupValue.trim().equalsIgnoreCase(rowerGroup)) {
                        isRestricted = true;
                        break;
                    }
                }
                if (!isRestricted) {
                    filteredBoats.add(boat);
                }
            }
        }

        return filteredBoats;
    }

    @AuraEnabled
    public static Id createSession(Id boatId, String sessionType, Date sessionDate, List<Id> crewRowerIds) {
        try {
            Rower__c currentRower = getCurrentRower();

            if (currentRower == null) {
                throw new AuraHandledException('No Rower record found for the current user. Please contact your administrator.');
            }

            Boat__c boat = [SELECT Id, Status__c FROM Boat__c WHERE Id = :boatId FOR UPDATE];
            if (boat.Status__c != 'Available') {
                throw new AuraHandledException('This boat is no longer available. Please select another boat.');
            }

            Rowing_Session__c session = new Rowing_Session__c(
                Boat__c = boatId,
                Booked_By__c = currentRower.Id,
                Session_Type__c = sessionType,
                Session_Date__c = sessionDate,
                Status__c = 'Booked'
            );
            insert session;

            List<Session_Member__c> members = new List<Session_Member__c>();

            // Add the booking rower
            members.add(new Session_Member__c(
                Session__c = session.Id,
                Rower__c = currentRower.Id
            ));

            // Add crew members (avoid duplicating the booking rower)
            if (crewRowerIds != null) {
                for (Id rowerId : crewRowerIds) {
                    if (rowerId != currentRower.Id) {
                        members.add(new Session_Member__c(
                            Session__c = session.Id,
                            Rower__c = rowerId
                        ));
                    }
                }
            }

            insert members;

            return session.Id;
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static void startSession(Id sessionId) {
        Savepoint sp = Database.setSavepoint();
        try {
            Rowing_Session__c session = [
                SELECT Id, Boat__c
                FROM Rowing_Session__c
                WHERE Id = :sessionId
                LIMIT 1
            ];

            session.Status__c = 'In Progress';
            session.Start_Time__c = Datetime.now();
            update session;

            Boat__c boat = new Boat__c(Id = session.Boat__c, Status__c = 'In Use');
            update boat;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static void endSession(Id sessionId) {
        Savepoint sp = Database.setSavepoint();
        try {
            Rowing_Session__c session = [
                SELECT Id, Boat__c
                FROM Rowing_Session__c
                WHERE Id = :sessionId
                LIMIT 1
            ];

            session.Status__c = 'Completed';
            session.End_Time__c = Datetime.now();
            update session;

            Boat__c boat = new Boat__c(Id = session.Boat__c, Status__c = 'Available');
            update boat;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static Rower__c getCurrentRower() {
        List<Rower__c> rowers = [
            SELECT Id, User__c, Group__c, License_Number__c
            FROM Rower__c
            WHERE User__c = :UserInfo.getUserId()
            LIMIT 1
        ];
        return rowers.isEmpty() ? null : rowers[0];
    }
}
