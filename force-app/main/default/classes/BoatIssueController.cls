public with sharing class BoatIssueController {

    @AuraEnabled
    public static void reportIssue(Id sessionId, Id boatId, String issueTypes, String description, String severity) {
        try {
            Rower__c currentRower = RowingSessionController.getCurrentRower();

            Boat_Issue__c issue = new Boat_Issue__c(
                Session__c = sessionId,
                Boat__c = boatId,
                Issue_Type__c = issueTypes,
                Description__c = description,
                Severity__c = severity,
                Reported_By__c = currentRower != null ? currentRower.Id : null,
                Resolved__c = false
            );
            insert issue;

            if (severity == 'Critical') {
                Boat__c boat = new Boat__c(Id = boatId, Status__c = 'Under Repair');
                update boat;
            }
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}
