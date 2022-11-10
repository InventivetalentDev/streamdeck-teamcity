/* global $CC, Utils, $SD */

$SD.on('connected', json => {
    $SD.on('org.inventivetalent.teamcity.action.willAppear', (jsonObj) => action.onWillAppear(jsonObj));
    $SD.on('org.inventivetalent.teamcity.action.willDisappear', (jsonObj) => action.onWillDisappear(jsonObj));
    $SD.on('org.inventivetalent.teamcity.action.keyUp', (jsonObj) => action.onKeyUp(jsonObj));
    // $SD.on('org.inventivetalent.teamcity.action.sendToPlugin', (jsonObj) => action.onSendToPlugin(jsonObj));
    $SD.on('org.inventivetalent.teamcity.action.didReceiveSettings', (jsonObj) => action.onReceivedSettings(jsonObj));
    $SD.on('org.inventivetalent.teamcity.action.propertyInspectorDidAppear', (jsonObj) => {
        console.log('%c%s', 'color: white; background: black; font-size: 13px;', '[app.js]propertyInspectorDidAppear:');
    });
    $SD.on('org.inventivetalent.teamcity.action.propertyInspectorDidDisappear', (jsonObj) => {
        console.log('%c%s', 'color: white; background: red; font-size: 13px;', '[app.js]propertyInspectorDidDisappear:');
    });
});

const action = {
    context: undefined,
    settings: {},
    currentUser: undefined,
    pendingBuilds: [],
    onReceivedSettings: function (json) {
        console.log('onReceivedSettings', json);
        this.settings = json?.payload?.settings || {};
    },
    onWillAppear: function (json) {
        console.log('onWillAppear', json);
        this.context = json.context;
        this.settings = json.payload.settings;

        this.refreshUser();
    },
    onWillDisappear: function (json) {
        console.log('onWillDisappear', json);
    },
    onKeyUp: function (json) {
        console.log('onKeyUp', json);
        this.refresh();
    },
    setTitle: function (title) {
        $SD.api.setTitle(this.context, title)
    },
    apiRequest: function (query) {
        let url = new URL(query, this.settings.host);
        return fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${ this.settings.token }`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'streamdeck-teamcity'
            }
        }).then(response => {
            console.log(response);
            return response.json().then(body => {
                console.log(body);
                return body;
            })
        })
    },
    getCurrentUser: function () {
        return this.apiRequest("/app/rest/users/current?fields=username,name,id,email");
    },
    getBuilds: function () {
        return this.apiRequest("/app/rest/builds?locator=running:true&fields=build(user,id,status,state,finishEstimate,changes,startDate,queuedDate,finishDate,running,branchName,percentageComplete)").then(b => b.build);
    },
    refreshUser: function () {
        this.getCurrentUser().then(currentUser => {
            this.currentUser = currentUser;
        })
    },
    shouldIncludeBuild: function (build) {
        // if (!build.changes.count || build.changes.count <= 0) return false;
        if (build.state === 'queued' || build.state === 'running') return true;
        if (build.state === 'finished') {
            let fiveMinutesAgo = moment().subtract(5, 'minutes');
            let finishDate = moment(build.finishDate);
            if (finishDate.isAfter(fiveMinutesAgo)) {
                return true;
            }
            return false;
        }
        return false;
    },
    render: function () {
        let title = "???";
        if (this.pendingBuilds.length <= 0) {
            title = "IDLE";
        } else {
            //TODO: support multiple
            let build = this.pendingBuilds[0].build;
            if (build.finishEstimate) {
                let duration = moment.duration(moment(build.finishEstimate).diff(moment()))
                title = "" + duration.seconds() + "s";
            } else {
                title = build.state;
            }

            setTimeout(() => this.render(), 1000);
        }

        this.setTitle(title);
    },
    //TODO: refresh running builds by their ID instead of checking all builds again
    refresh: function () {
        if (!this.currentUser) {
            this.refreshUser();
            return;
        }

        this.getBuilds().then(builds => {
            console.log("builds", builds);

            let changePromises = [];
            let pendingBuilds = [];
            for (let build of builds) {
                if (!this.shouldIncludeBuild(build)) continue;
                changePromises.push(this.apiRequest(build.changes.href + '&fields=change(user,id,version,username,date,href)')
                    .then(b => b.change)
                    .then(changes => {
                        console.log("change", changes);
                        return changes.filter(c => c.user.id === this.currentUser.id);
                    })
                    .then(changes => {
                        if (changes.length > 0) {
                            pendingBuilds.push({
                                build: build,
                                changes: changes
                            })
                        }
                    }))
            }

            Promise.all(changePromises).then(() => {
                console.log("pendingBuilds", pendingBuilds);
                this.pendingBuilds = pendingBuilds;

                this.render();

                if (this.pendingBuilds.length > 0) {
                    setTimeout(() => this.refresh(), 2000);
                }
            })
        })
    },
}
