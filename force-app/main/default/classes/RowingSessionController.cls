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

        Rower__c currentRower = getCurrentRower();
        String rowerGroup = (currentRower != null && String.isNotBlank(currentRower.Group__c))
            ? currentRower.Group__c
            : null;

        if (rowerGroup == null) {
            return boats;
        }

        List<Boat__c> filteredBoats = new List<Boat__c>();
        for (Boat__c boat : boats) {
            if (String.isBlank(boat.Restricted_Groups__c)) {
                filteredBoats.add(boat);
            } else {
                List<String> restrictedGroups = boat.Restricted_Groups__c.split(';');
                Boolean isRestricted = false;
                for (String group : restrictedGroups) {
                    if (group.trim().equalsIgnoreCase(rowerGroup)) {
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
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static void endSession(Id sessionId) {
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
