import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getFleetStatus from '@salesforce/apex/FleetDashboardController.getFleetStatus';
import setBoatStatus from '@salesforce/apex/FleetDashboardController.setBoatStatus';

export default class RowingFleetDashboard extends LightningElement {

    // ─── Reactive state ───────────────────────────────────────────────────────

    @track fleetData = [];
    @track selectedDate = new Date().toISOString().split('T')[0];
    @track selectedSessionType = 'All Day';
    @track isLoading = false;
    @track expandedBoatId = null;
    @track error = null;

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    connectedCallback() {
        this.loadFleetData();
    }

    // ─── Date helpers ─────────────────────────────────────────────────────────

    get isToday() {
        return this.selectedDate === new Date().toISOString().split('T')[0];
    }

    get selectedDateFormatted() {
        return new Date(this.selectedDate + 'T00:00:00').toLocaleDateString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        });
    }

    handlePrevDay() {
        const d = new Date(this.selectedDate + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        this.selectedDate = d.toISOString().split('T')[0];
        this.expandedBoatId = null;
        this.loadFleetData();
    }

    handleNextDay() {
        if (this.isToday) return;
        const d = new Date(this.selectedDate + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        this.selectedDate = d.toISOString().split('T')[0];
        this.expandedBoatId = null;
        this.loadFleetData();
    }

    handleToday() {
        this.selectedDate = new Date().toISOString().split('T')[0];
        this.expandedBoatId = null;
        this.loadFleetData();
    }

    // ─── Session filter ───────────────────────────────────────────────────────

    get morningVariant() {
        return this.selectedSessionType === 'Morning' ? 'brand' : 'neutral';
    }

    get afternoonVariant() {
        return this.selectedSessionType === 'Afternoon' ? 'brand' : 'neutral';
    }

    get allDayVariant() {
        return this.selectedSessionType === 'All Day' ? 'brand' : 'neutral';
    }

    handleSessionTypeChange(event) {
        this.selectedSessionType = event.currentTarget.dataset.value;
        this.expandedBoatId = null;
        this.loadFleetData();
    }

    // ─── Data loading ─────────────────────────────────────────────────────────

    loadFleetData() {
        this.isLoading = true;
        this.error = null;

        const sessionTypeParam = this.selectedSessionType === 'All Day' ? null : this.selectedSessionType;

        getFleetStatus({
            selectedDate: this.selectedDate,
            sessionType: sessionTypeParam
        })
            .then(result => {
                this.fleetData = (result || []).map(item => this.enrichItem(item));
            })
            .catch(err => {
                this.error = this.extractError(err);
                this.fleetData = [];
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    // Enrich each BoatStatus item with display helpers
    enrichItem(item) {
        const boatId = item.boat.Id;
        const isExpanded = this.expandedBoatId === boatId;
        const status = item.boat.Status__c || '';
        const issueCount = item.openIssueCount || 0;
        const crewNames = item.crewNames || [];

        // Session slot display
        let sessionSlot = '—';
        if (item.session) {
            sessionSlot = item.session.Session_Type__c || '—';
        }

        // Crew display: first name + count
        let crewDisplay = '—';
        if (crewNames.length > 0) {
            const firstName = crewNames[0];
            crewDisplay = crewNames.length > 1
                ? `${firstName} +${crewNames.length - 1}`
                : firstName;
        }

        // Status badge CSS class
        let statusBadgeClass = 'status-badge';
        if (status === 'Available') statusBadgeClass += ' badge-available';
        else if (status === 'In Use') statusBadgeClass += ' badge-inuse';
        else if (status === 'Under Repair') statusBadgeClass += ' badge-repair';

        // Row class (clickable, highlighted when expanded)
        let rowClass = 'boat-row';
        if (isExpanded) rowClass += ' row-expanded';

        return {
            ...item,
            isExpanded,
            rowClass,
            statusBadgeClass,
            sessionSlot,
            crewDisplay,
            hasIssues: issueCount > 0,
            hasCrewNames: crewNames.length > 0,
            detailRowKey: boatId + '_detail',
            sessionStartFormatted: item.session && item.session.Start_Time__c
                ? this.formatDateTime(item.session.Start_Time__c) : '—',
            sessionEndFormatted: item.session && item.session.End_Time__c
                ? this.formatDateTime(item.session.End_Time__c) : '—',
        };
    }

    formatDateTime(dtString) {
        if (!dtString) return '—';
        return new Date(dtString).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // ─── Summary counts (derived getters) ────────────────────────────────────

    get countAvailable() {
        return (this.fleetData || []).filter(i => i.boat.Status__c === 'Available').length;
    }

    get countInUse() {
        return (this.fleetData || []).filter(i => i.boat.Status__c === 'In Use').length;
    }

    get countUnderRepair() {
        return (this.fleetData || []).filter(i => i.boat.Status__c === 'Under Repair').length;
    }

    get countOpenIssues() {
        return (this.fleetData || []).reduce((sum, i) => sum + (i.openIssueCount || 0), 0);
    }

    get hasFleetData() {
        return this.fleetData && this.fleetData.length > 0;
    }

    // ─── Row expand / collapse ────────────────────────────────────────────────

    handleRowClick(event) {
        const boatId = event.currentTarget.dataset.boatId;
        if (!boatId) return;

        // Toggle: collapse if already expanded, otherwise expand this row
        this.expandedBoatId = this.expandedBoatId === boatId ? null : boatId;

        // Re-enrich to update isExpanded / rowClass on all items
        this.fleetData = this.fleetData.map(item => this.enrichItem(item));
    }

    // Stop click propagation for cells that have their own actions
    handleStopPropagation(event) {
        event.stopPropagation();
    }

    // ─── Set Status action ────────────────────────────────────────────────────

    handleSetStatus(event) {
        const selectedValue = event.detail.value;
        // The boat id is on the button-menu element itself
        const menuEl = event.currentTarget;
        const boatId = menuEl.dataset.boatId;

        if (!boatId || !selectedValue) return;

        this.isLoading = true;

        setBoatStatus({ boatId, status: selectedValue })
            .then(() => {
                this.showToast(
                    'Status updated',
                    `Boat status set to "${selectedValue}".`,
                    'success'
                );
                this.loadFleetData();
            })
            .catch(err => {
                this.showToast('Error', this.extractError(err), 'error');
                this.isLoading = false;
            });
    }

    // ─── Utilities ────────────────────────────────────────────────────────────

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    extractError(error) {
        if (error && error.body && error.body.message) {
            return error.body.message;
        }
        if (error && error.message) {
            return error.message;
        }
        return 'An unexpected error occurred.';
    }
}
