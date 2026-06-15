public with sharing class RowingSessionController {

    @AuraEnabled
    public static List<Boat__c> getAvailableBoats(String sessionType, Date sessionDate, String capacity) {
        List<Boat__c> boats;

        if (String.isNotBlank(capacity)) {
            boats = [
                SELECT Id, Name, Capacity__c, Number_of_Oars__c, Has_Cox__c, Status__c, Restricted_Groups__c
                FROM Boat__c
                WHERE Status__c = 'Available'
                AND Capacity__c = :capacity
            ];
        } else {
            boats = [
                SELECT Id, Name, Capacity__c, Number_of_Oars__c, Has_Cox__c, Status__c, Restricted_Groups__c
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
        Savepoint sp = Database.setSavepoint();
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
                Status__c = 'In Progress',
                Start_Time__c = Datetime.now()
            );
            insert session;

            // Add explicitly selected crew members only.
            // The booking rower (Booked_By__c) is recorded on the session itself;
            // they are NOT automatically added as a member — they can add themselves
            // via the crew picker if they intend to row.
            List<Session_Member__c> members = new List<Session_Member__c>();
            if (crewRowerIds != null) {
                Set<Id> seen = new Set<Id>();
                for (Id rowerId : crewRowerIds) {
                    if (rowerId != null && seen.add(rowerId)) {
                        members.add(new Session_Member__c(
                            Session__c = session.Id,
                            Rower__c = rowerId
                        ));
                    }
                }
            }

            if (!members.isEmpty()) {
                insert members;
            }

            // Mark the boat as In Use immediately upon booking so it is
            // removed from the available list and shown correctly on the
            // Fleet Dashboard without waiting for the rower to start the session.
            boat.Status__c = 'In Use';
            update boat;

            return session.Id;
        } catch (AuraHandledException e) {
            Database.rollback(sp);
            throw e;
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException(e.getMessage());
        }
    }

    @AuraEnabled
    public static void cancelSession(Id sessionId) {
        Savepoint sp = Database.setSavepoint();
        try {
            Rowing_Session__c session = [
                SELECT Id, Boat__c, Status__c
                FROM Rowing_Session__c
                WHERE Id = :sessionId
                LIMIT 1
            ];
            if (session.Status__c == 'Completed' || session.Status__c == 'Cancelled') {
                throw new AuraHandledException('Only active sessions can be cancelled.');
            }
            session.Status__c = 'Cancelled';
            update session;

            Boat__c boat = new Boat__c(Id = session.Boat__c, Status__c = 'Available');
            update boat;
        } catch (AuraHandledException e) {
            Database.rollback(sp);
            throw e;
        } catch (Exception e) {
            Database.rollback(sp);
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

    @AuraEnabled
    public static Map<String, Object> getActiveSessionForCurrentRower() {
        Rower__c currentRower = getCurrentRower();
        if (currentRower == null) return null;

        Date today = Date.today();
        List<Rowing_Session__c> sessions = [
            SELECT Id, Boat__c, Boat__r.Name, Session_Type__c, Status__c
            FROM Rowing_Session__c
            WHERE Booked_By__c = :currentRower.Id
            AND Session_Date__c = :today
            AND Status__c IN ('Booked', 'In Progress')
            ORDER BY Status__c DESC
            LIMIT 1
        ];

        if (sessions.isEmpty()) return null;

        Rowing_Session__c s = sessions[0];
        return new Map<String, Object>{
            'sessionId'   => s.Id,
            'boatId'      => s.Boat__c,
            'boatName'    => s.Boat__r.Name,
            'sessionType' => s.Session_Type__c,
            'status'      => s.Status__c
        };
    }

    @AuraEnabled(cacheable=true)
    public static List<Rower__c> getRowers() {
        return [SELECT Id, User__c, User__r.Name, Group__c FROM Rower__c ORDER BY User__r.Name];
    }

    @AuraEnabled(cacheable=true)
    public static Rower__c getCurrentRower() {
        List<Rower__c> rowers = [
            SELECT Id, User__c, User__r.Name, Group__c, License_Number__c
            FROM Rower__c
            WHERE User__c = :UserInfo.getUserId()
            LIMIT 1
        ];
        return rowers.isEmpty() ? null : rowers[0];
    }
}