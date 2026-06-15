import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAvailableBoats from '@salesforce/apex/RowingSessionController.getAvailableBoats';
import getRowers from '@salesforce/apex/RowingSessionController.getRowers';
import getCurrentRower from '@salesforce/apex/RowingSessionController.getCurrentRower';
import getActiveSessionForCurrentRower from '@salesforce/apex/RowingSessionController.getActiveSessionForCurrentRower';
import createSession from '@salesforce/apex/RowingSessionController.createSession';
import cancelSession from '@salesforce/apex/RowingSessionController.cancelSession';
import startSession from '@salesforce/apex/RowingSessionController.startSession';
import endSession from '@salesforce/apex/RowingSessionController.endSession';
import reportIssue from '@salesforce/apex/BoatIssueController.reportIssue';

export default class RowingBookingScreen extends LightningElement {

    // ─── Reactive state ──────────────────────────────────────────────────────

    @track boats = [];
    @track rowers = [];
    @track currentRower = null;           // populated on load; used to exclude self from crew search
    @track selectedSessionType = 'Morning';
    @track selectedCapacity = null;       // null = All
    @track isLoading = false;

    // Modal state
    @track showModal = false;
    @track selectedBoat = { id: '', name: '', capacity: 0 };
    @track crew = [];                     // [{ id, name }]
    @track crewSearchTerm = '';

    
    
    
    // Active session — restored from Apex on load so Start/End Session survives page reloads
    @track activeSession = null;          // { sessionId, boatId, boatName, sessionType, status }

    // Issue form state
    @track showIssueForm = false;
    @track selectedIssueTypes = [];
    @track issueDescription = '';
    @track issueSeverity = 'Minor';

    // ─── Constants ────────────────────────────────────────────────────────────

    get todayDate() {
        return new Date();
    }

    get todayFormatted() {
        return this.todayDate.toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    // Apex expects a Date string in YYYY-MM-DD format
    get todayApexDate() {
        const d = this.todayDate;
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day   = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${month}-${day}`;
    }

    // ─── Session type toggle ──────────────────────────────────────────────────

    get morningVariant() {
        return this.selectedSessionType === 'Morning' ? 'brand' : 'neutral';
    }

    get afternoonVariant() {
        return this.selectedSessionType === 'Afternoon' ? 'brand' : 'neutral';
    }

    handleSessionTypeChange(event) {
        this.selectedSessionType = event.currentTarget.dataset.value;
        this.loadBoats();
    }

    // ─── Capacity filter ─────────────────────────────────────────────────────

    get capacityOptions() {
        const options = [
            { value: null,  label: 'All'  },
            { value: 1,     label: '1'    },
            { value: 2,     label: '2'    },
            { value: 4,     label: '4'    },
            { value: 8,     label: '8'    },
        ];
        return options.map(opt => ({
            ...opt,
            // Coerce both sides to string for comparison when selectedCapacity is a number
            cssClass: String(opt.value) === String(this.selectedCapacity)
                ? 'capacity-btn capacity-btn_active'
                : 'capacity-btn',
        }));
    }

    handleCapacityChange(event) {
        const raw = event.currentTarget.dataset.value;
        // dataset values are always strings; convert back to int or null
        this.selectedCapacity = raw === 'null' || raw === '' ? null : raw;
        this.loadBoats();
    }

    // ─── Boat list ────────────────────────────────────────────────────────────

    connectedCallback() {
        this.loadBoats();

        // Restore any active session from today so Start/End Session survives a page reload
        getActiveSessionForCurrentRower()
            .then(result => {
                if (result) {
                    this.activeSession = {
                        sessionId:   result.sessionId,
                        boatId:      result.boatId,
                        boatName:    result.boatName,
                        sessionType: result.sessionType,
                        status:      result.status,
                    };
                }
            })
            .catch(error => console.error('Error restoring active session:', error));

        // Load current rower and all rowers; current user is included in the
        // crew search — they can add themselves explicitly if they intend to row.
        Promise.all([getCurrentRower(), getRowers()])
            .then(([currentRower, allRowers]) => {
                this.currentRower = currentRower;
                this.rowers = allRowers || [];
            })
            .catch(error => console.error('Error loading rowers:', error));
    }

    loadBoats() {
        this.isLoading = true;
        getAvailableBoats({
            sessionType: this.selectedSessionType,
            sessionDate: this.todayApexDate,
            capacity: this.selectedCapacity,
        })
            .then(result => {
                this.boats = (result || []).sort((a, b) => {
                    const capA = parseInt(a.Capacity__c, 10);
                    const capB = parseInt(b.Capacity__c, 10);
                    if (capA !== capB) return capA - capB;
                    // Within same capacity: coxed first
                    return (b.Has_Cox__c ? 1 : 0) - (a.Has_Cox__c ? 1 : 0);
                }).map(boat => {
                    const capacity = parseInt(boat.Capacity__c, 10);
                    const hasCox = boat.Has_Cox__c === true;
                    const rowerSeats = hasCox ? capacity - 1 : capacity;
                    const isSkiff = rowerSeats === 1;
                    const isPointe = !isSkiff && boat.Number_of_Oars__c === rowerSeats;
                    const rowingStyle = isSkiff
                        ? 'Skiff'
                        : isPointe ? 'Pointe ' + '-'.repeat(rowerSeats) : 'Couple ' + 'X'.repeat(rowerSeats);
                    const rowingStyleClass = isSkiff ? 'badge-skiff' : isPointe ? 'badge-pointe' : 'badge-couple';
                    return {
                        ...boat,
                        displayCapacity: String(rowerSeats),
                        rowingStyle,
                        rowingStyleClass,
                    };
                });
            })
            .catch(error => {
                console.error('loadBoats error:', JSON.stringify(error));
                this.showToast('Error loading boats', this.extractError(error), 'error');
                this.boats = [];
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    get hasBoats() {
        return this.boats && this.boats.length > 0;
    }

    get showBoatList() {
        return !this.isLoading && this.hasBoats;
    }

    get showEmptyState() {
        return !this.isLoading && !this.hasBoats;
    }

    // ─── Book a Boat header button ────────────────────────────────────────────

    get bookABoatDisabled() {
        return this.isLoading || !this.hasBoats;
    }

    handleBookABoatClick() {
        if (!this.boats || this.boats.length === 0) return;
        // Open the first available boat's modal directly
        const boat = this.boats[0];
        this.selectedBoat = {
            id: boat.Id,
            name: boat.Name,
            capacity: parseInt(boat.Capacity__c, 10),
        };
        this.crew = [];
        this.crewSearchTerm = '';
        this.showModal = true;
    }

    // ─── Booking modal ────────────────────────────────────────────────────────

    handleBookClick(event) {
        const { boatId, boatName, boatCapacity } = event.currentTarget.dataset;
        this.selectedBoat = {
            id: boatId,
            name: boatName,
            capacity: parseInt(boatCapacity, 10),
        };
        this.crew = [];
        this.crewSearchTerm = '';
        this.showModal = true;
    }

    handleCloseModal() {
        this.showModal = false;
    }

    handleModalBackdropClick() {
        this.showModal = false;
    }

    // All seats are available for explicit crew selection.
    // The booking rower is recorded on the session (Booked_By__c) but does NOT
    // automatically occupy a crew slot — they add themselves via the picker if rowing.
    get maxCrewSize() {
        return this.selectedBoat.capacity || 0;
    }

    get isCrewFull() {
        return this.crew.length >= this.maxCrewSize;
    }

    get hasCrew() {
        return this.crew.length > 0;
    }

    // Seats filled = number of explicitly selected crew members
    get seatsUsed() {
        return this.crew.length;
    }

    // ─── Crew search (against mock data; swap for Apex wire when available) ───

    get showCrewSearchResults() {
        return this.crewSearchTerm.length > 0 && this.filteredRowers.length > 0;
    }

    get filteredRowers() {
        if (!this.crewSearchTerm) return [];
        const term = this.crewSearchTerm.toLowerCase();
        const alreadySelectedIds = new Set(this.crew.map(m => m.id));
        return this.rowers
            .map(r => ({
                id: r.Id,
                name: r.User__r ? r.User__r.Name : r.Id,
            }))
            .filter(r =>
                r.name.toLowerCase().includes(term) && !alreadySelectedIds.has(r.id)
            );
    }

    handleCrewSearch(event) {
        this.crewSearchTerm = event.detail.value;
    }

    handleSelectCrewMember(event) {
        if (this.isCrewFull) return;
        const { rowerId, rowerName } = event.currentTarget.dataset;
        this.crew = [...this.crew, { id: rowerId, name: rowerName }];
        this.crewSearchTerm = '';
    }

    handleRemoveCrewMember(event) {
        const rowerId = event.currentTarget.dataset.rowerId;
        this.crew = this.crew.filter(m => m.id !== rowerId);
    }

    // ─── Confirm booking ──────────────────────────────────────────────────────

    handleConfirmBooking() {
        this.isLoading = true;
        const crewIds = this.crew.map(m => m.id);

        createSession({
            boatId: this.selectedBoat.id,
            sessionType: this.selectedSessionType,
            sessionDate: this.todayApexDate,
            crewRowerIds: crewIds,
        })
            .then(sessionId => {
                this.showModal = false;
                this.showToast('Booking confirmed!', `${this.selectedBoat.name} is booked for the ${this.selectedSessionType} session.`, 'success');

                // Populate active session (in-memory only — see limitation note at top)
                this.activeSession = {
                    sessionId: sessionId,
                    boatId: this.selectedBoat.id,
                    boatName: this.selectedBoat.name,
                    sessionType: this.selectedSessionType,
                    status: 'In Progress',
                };

                // Refresh boat list to remove the just-booked boat
                this.loadBoats();
            })
            .catch(error => {
                this.showToast('Booking failed', this.extractError(error), 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    // ─── Active session helpers ───────────────────────────────────────────────

    get hasActiveSession() {
        return this.activeSession !== null && this.activeSession !== undefined;
    }

    get isSessionBooked() {
        return this.activeSession && this.activeSession.status === 'Booked';
    }

    get isSessionInProgress() {
        return this.activeSession && this.activeSession.status === 'In Progress';
    }

    get activeSessionHeading() {
        const name = this.currentRower && this.currentRower.User__r
            ? this.currentRower.User__r.Name
            : null;
        return name ? `${name}'s Session` : 'Session';
    }

    get activeSessionStatusLabel() {
        if (!this.activeSession) return '';
        return this.activeSession.status === 'In Progress' ? 'Is Rowing' : this.activeSession.status;
    }

    get activeSessionStatusClass() {
        if (!this.activeSession) return '';
        return this.activeSession.status === 'In Progress'
            ? 'session-badge-inprogress'
            : 'session-badge-booked';
    }

    handleEndSession() {
        this.isLoading = true;
        endSession({ sessionId: this.activeSession.sessionId })
            .then(() => {
                this.activeSession = null;
                this.showToast('Session ended', 'Your session has been completed. Well rowed!', 'success');
                this.loadBoats();
            })
            .catch(error => {
                this.showToast('Error ending session', this.extractError(error), 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    handleCancelBooking() {
        this.isLoading = true;
        cancelSession({ sessionId: this.activeSession.sessionId })
            .then(() => {
                this.activeSession = null;
                this.showToast('Booking cancelled', 'The booking has been cancelled. The boat is now available again.', 'success');
                this.loadBoats();
            })
            .catch(error => {
                this.showToast('Error', this.extractError(error), 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    handleStartSession() {
        this.isLoading = true;
        startSession({ sessionId: this.activeSession.sessionId })
            .then(() => {
                this.activeSession = { ...this.activeSession, status: 'In Progress' };
                this.showToast('Session started!', `Your ${this.activeSession.sessionType} session has started. Good luck on the water!`, 'success');
            })
            .catch(error => {
                this.showToast('Error', this.extractError(error), 'error');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }

    // ─── Issue form ───────────────────────────────────────────────────────────

    get endSessionButtonLabel() {
        return this.selectedIssueTypes.length > 0 ? 'Submit & End Session' : 'End Session';
    }

    get issueTypeOptions() {
        return [
            { value: 'Broken Oar',   label: 'Broken Oar'   },
            { value: 'Hull Damage',  label: 'Hull Damage'   },
            { value: 'Rudder Issue', label: 'Rudder Issue'  },
            { value: 'Seat Issue',   label: 'Seat Issue'    },
            { value: 'Other',        label: 'Other'         },
        ];
    }

    get severityOptions() {
        return [
            { value: 'Minor',    label: 'Minor'    },
            { value: 'Major',    label: 'Major'    },
            { value: 'Critical', label: 'Critical' },
        ];
    }

    handleShowIssueForm() {
        this.showIssueForm = true;
        this.selectedIssueTypes = [];
        this.issueDescription = '';
        this.issueSeverity = 'Minor';
    }

    handleCancelIssueForm() {
        this.showIssueForm = false;
    }

    handleIssueTypeChange(event) {
        const value = event.target.value;
        if (event.target.checked) {
            this.selectedIssueTypes = [...this.selectedIssueTypes, value];
        } else {
            this.selectedIssueTypes = this.selectedIssueTypes.filter(v => v !== value);
        }
    }

    handleIssueDescriptionChange(event) {
        this.issueDescription = event.detail.value;
    }

    handleSeverityChange(event) {
        this.issueSeverity = event.detail.value;
    }

    handleSubmitAndEndSession() {
        this.isLoading = true;
        const { sessionId, boatId } = this.activeSession;

        const doEndSession = () =>
            endSession({ sessionId })
                .then(() => {
                    this.activeSession = null;
                    this.showIssueForm = false;
                    this.showToast('Session ended', 'Your session has been completed. Well rowed!', 'success');
                    this.loadBoats();
                })
                .catch(error => {
                    this.showToast('Error ending session', this.extractError(error), 'error');
                })
                .finally(() => {
                    this.isLoading = false;
                });

        if (this.selectedIssueTypes.length > 0) {
            reportIssue({
                sessionId,
                boatId,
                issueTypes: this.selectedIssueTypes.join(';'),
                description: this.issueDescription,
                severity: this.issueSeverity,
            })
                .then(() => doEndSession())
                .catch(error => {
                    this.showToast('Error reporting issue', this.extractError(error), 'error');
                    this.isLoading = false;
                });
        } else {
            doEndSession();
        }
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
