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
    @track activeFilter = null;
    @track sortCol = null;   // column key
    @track sortAsc = true;

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
        this.activeFilter = null;
        this.loadFleetData();
    }

    handleNextDay() {
        if (this.isToday) return;
        const d = new Date(this.selectedDate + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        this.selectedDate = d.toISOString().split('T')[0];
        this.expandedBoatId = null;
        this.activeFilter = null;
        this.loadFleetData();
    }

    handleToday() {
        this.selectedDate = new Date().toISOString().split('T')[0];
        this.expandedBoatId = null;
        this.activeFilter = null;
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
        this.activeFilter = null;
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

        // Rowing type badge
        const capacity = parseInt(item.boat.Capacity__c, 10);
        const hasCox = item.boat.Has_Cox__c === true;
        const rowerSeats = hasCox ? capacity - 1 : capacity;
        const isSkiff = rowerSeats === 1;
        const isPointe = !isSkiff && item.boat.Number_of_Oars__c === rowerSeats;
        const rowingStyle = isSkiff ? 'Skiff'
            : isPointe ? 'Pointe ' + '-'.repeat(rowerSeats)
            : 'Couple ' + 'X'.repeat(rowerSeats);
        const rowingStyleClass = isSkiff ? 'badge-skiff' : isPointe ? 'badge-pointe' : 'badge-couple';
        const displayCapacity = String(rowerSeats);

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

        const enrichedIssues = (item.openIssues || []).map(issue => ({
            ...issue,
            severityBadgeClass: issue.Severity__c === 'Critical' ? 'slds-badge slds-theme_error' :
                                 issue.Severity__c === 'Major' ? 'slds-badge slds-theme_warning' :
                                 'slds-badge'
        }));

        const enrichedCrew = (crewNames).map((name, idx) => ({ key: idx + '_' + name, name }));

        return {
            ...item,
            isExpanded,
            rowClass,
            statusBadgeClass,
            sessionSlot,
            crewDisplay,
            enrichedIssues,
            enrichedCrew,
            hasIssues: issueCount > 0,
            isAvailable: status === 'Available',
            hasCrewNames: crewNames.length > 0,
            detailRowKey: boatId + '_detail',
            displayCapacity,
            rowingStyle,
            rowingStyleClass,
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
        return this.filteredFleetData && this.filteredFleetData.length > 0;
    }

    get filteredFleetData() {
        let data = [...this.fleetData];

        // Metric tile sort (bubble matching rows to top)
        if (this.activeFilter) {
            data = data.sort((a, b) => {
                const aMatch = this.activeFilter === 'Open Issues' ? a.hasIssues : a.boat.Status__c === this.activeFilter;
                const bMatch = this.activeFilter === 'Open Issues' ? b.hasIssues : b.boat.Status__c === this.activeFilter;
                if (aMatch && !bMatch) return -1;
                if (!aMatch && bMatch) return 1;
                return 0;
            });
        }

        // Column header sort
        if (this.sortCol) {
            const dir = this.sortAsc ? 1 : -1;
            data = data.sort((a, b) => {
                let valA, valB;
                switch (this.sortCol) {
                    case 'name':     valA = a.boat.Name; valB = b.boat.Name; break;
                    case 'capacity': valA = parseInt(a.displayCapacity, 10); valB = parseInt(b.displayCapacity, 10); return (valA - valB) * dir;
                    case 'type':     valA = a.rowingStyle; valB = b.rowingStyle; break;
                    case 'cox':      return ((a.boat.Has_Cox__c ? 1 : 0) - (b.boat.Has_Cox__c ? 1 : 0)) * dir;
                    case 'status':   valA = a.boat.Status__c; valB = b.boat.Status__c; break;
                    case 'session':  valA = a.sessionSlot; valB = b.sessionSlot; break;
                    case 'issues':   return ((a.openIssueCount || 0) - (b.openIssueCount || 0)) * dir;
                    default: return 0;
                }
                return (valA || '').localeCompare(valB || '') * dir;
            });
        }
        return data;
    }

    get sortIndicator() {
        const cols = ['name','capacity','type','cox','status','session','issues'];
        const result = {};
        cols.forEach(c => {
            result[c] = this.sortCol === c ? (this.sortAsc ? ' ▲' : ' ▼') : '';
        });
        return result;
    }

    handleSortClick(event) {
        const col = event.currentTarget.dataset.col;
        if (this.sortCol === col) {
            this.sortAsc = !this.sortAsc;
        } else {
            this.sortCol = col;
            this.sortAsc = true;
        }
    }

    handleMetricClick(event) {
        const filter = event.currentTarget.dataset.filter;
        this.activeFilter = this.activeFilter === filter ? null : filter;
        this.sortCol = null;
    }

    tileClass(filter) {
        return this.activeFilter === filter
            ? 'slds-col slds-text-align_center summary-tile summary-tile_active summary-tile_' + filter.toLowerCase().replace(/ /g, '')
            : 'slds-col slds-text-align_center summary-tile summary-tile_' + filter.toLowerCase().replace(/ /g, '');
    }

    get tileClassAvailable()   { return this.tileClass('Available'); }
    get tileClassInUse()       { return this.tileClass('In Use'); }
    get tileClassUnderRepair() { return this.tileClass('Under Repair'); }
    get tileClassOpenIssues()  { return this.tileClass('Open Issues'); }

    get showContent() {
        return !this.isLoading;
    }

    get showEmptyState() {
        return !this.isLoading && !this.hasFleetData && !this.error;
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
