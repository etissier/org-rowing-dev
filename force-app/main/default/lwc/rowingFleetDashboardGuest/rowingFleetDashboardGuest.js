import { LightningElement, track, wire } from 'lwc';
import getFleetStatus from '@salesforce/apex/FleetDashboardGuestController.getFleetStatus';

export default class RowingFleetDashboardGuest extends LightningElement {
    @track selectedDate = new Date().toISOString().split('T')[0];
    @track selectedSessionType = 'All';
    @track boatStatuses = [];
    @track error;
    @track isLoading = false;

    sessionTypeOptions = [
        { label: 'All Sessions', value: 'All' },
        { label: 'Morning', value: 'Morning' },
        { label: 'Afternoon', value: 'Afternoon' },
        { label: 'Evening', value: 'Evening' }
    ];

    connectedCallback() {
        this.loadFleetStatus();
    }

    handleDateChange(event) {
        this.selectedDate = event.target.value;
        this.loadFleetStatus();
    }

    handleSessionTypeChange(event) {
        this.selectedSessionType = event.detail.value;
        this.loadFleetStatus();
    }

    loadFleetStatus() {
        this.isLoading = true;
        this.error = undefined;

        getFleetStatus({
            selectedDate: this.selectedDate,
            sessionType: this.selectedSessionType
        })
            .then(result => {
                this.boatStatuses = result.map(bs => ({
                    ...bs,
                    id: bs.boat.Id,
                    hasSession: !!bs.session,
                    hasIssues: bs.openIssueCount > 0,
                    statusClass: this.getStatusClass(bs.boat.Status__c, bs.openIssueCount),
                    statusLabel: bs.boat.Status__c || 'Unknown',
                    hasCrew: bs.crewNames && bs.crewNames.length > 0,
                    crewList: bs.crewNames ? bs.crewNames.join(', ') : 'No crew',
                    sessionInfo: this.formatSessionInfo(bs.session)
                }));
                this.isLoading = false;
            })
            .catch(error => {
                this.error = error;
                this.boatStatuses = [];
                this.isLoading = false;
            });
    }

    getStatusClass(status, issueCount) {
        if (issueCount > 0) return 'slds-badge slds-theme_error';
        if (status === 'Available') return 'slds-badge slds-theme_success';
        if (status === 'In Use') return 'slds-badge slds-theme_warning';
        if (status === 'Under Repair') return 'slds-badge slds-theme_error';
        return 'slds-badge';
    }

    formatSessionInfo(session) {
        if (!session) return 'No active session';
        const startTime = session.Start_Time__c || '';
        const endTime = session.End_Time__c || '';
        return `${session.Session_Type__c || ''} (${startTime} - ${endTime})`;
    }

    handleRefresh() {
        this.loadFleetStatus();
    }
}
