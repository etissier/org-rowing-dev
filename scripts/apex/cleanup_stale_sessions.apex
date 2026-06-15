// Complete/cancel all stale sessions and fix boat statuses
List<Rowing_Session__c> sessions = [
    SELECT Id, Status__c, Boat__c
    FROM Rowing_Session__c
    WHERE Status__c IN ('Booked', 'In Progress')
];

for (Rowing_Session__c s : sessions) {
    s.Status__c = (s.Status__c == 'In Progress') ? 'Completed' : 'Cancelled';
}
if (!sessions.isEmpty()) update sessions;

// Reset any boat stuck in 'In Use' back to Available
// (only if it no longer has an active session after the update above)
Set<Id> stillActiveBoatIds = new Set<Id>();
for (Rowing_Session__c s : [
    SELECT Boat__c FROM Rowing_Session__c
    WHERE Status__c IN ('Booked', 'In Progress')
]) {
    stillActiveBoatIds.add(s.Boat__c);
}

List<Boat__c> boatsToFix = [SELECT Id, Status__c FROM Boat__c WHERE Status__c = 'In Use'];
List<Boat__c> toUpdate = new List<Boat__c>();
for (Boat__c b : boatsToFix) {
    if (!stillActiveBoatIds.contains(b.Id)) {
        b.Status__c = 'Available';
        toUpdate.add(b);
    }
}
if (!toUpdate.isEmpty()) update toUpdate;

System.debug('Sessions cleaned: ' + sessions.size());
System.debug('Boats reset: ' + toUpdate.size());