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
    runningBuilds: {},
    backgroundColor: 'black',
    timers: {
        allRefresh: 0,
        runningRefresh: 0
    },
    onReceivedSettings: function (json) {
        console.log('onReceivedSettings', json);
        this.settings = json?.payload?.settings || {};
    },
    onWillAppear: function (json) {
        console.log('onWillAppear', json);
        this.context = json.context;
        this.settings = json.payload.settings;

        this.refreshUser();

        setInterval(() => this.refreshAllBuilds(), 10000);
        this.refreshAllBuilds();
    },
    onWillDisappear: function (json) {
        console.log('onWillDisappear', json);
    },
    onKeyUp: function (json) {
        console.log('onKeyUp', json);
        this.refreshAllBuilds();
    },
    setTitle: function (title) {
        $SD.api.setTitle(this.context, title)
    },
    showOk: function () {
        $SD.api.showOk(this.context);
    },
    showAlert: function () {
        $SD.api.showAlert(this.context);
    },
    clearAndSetTimeout(key, fun, time) {
        clearTimeout(this.timers[key]);
        this.timers[key] = setTimeout(fun, time);
    },
    clearAndSetInterval(key, fun, time) {
        clearInterval(this.timers[key]);
        this.timers[key] = setInterval(fun, time);
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
        return this.apiRequest("/app/rest/builds?locator=running:true&fields=build(user,id,status,state,finishEstimate,changes,startDate,queuedDate,finishDate,running,branchName,percentageComplete,triggered(user),buildType)").then(b => b.build);
    },
    refreshUser: function () {
        console.log("#refreshUser")
        this.getCurrentUser().then(currentUser => {
            this.currentUser = currentUser;
        })
    },
    getBuildById: function (id) {
        return this.apiRequest(`/app/rest/builds?locator=id:${ id }&fields=build(user,running,buildTypeId,status,state,branchName,startDate,finishDate,finishEstimate,triggered(user),buildType)`).then(b => b.build);
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
    draw: function (ctxConsumer) {
        console.log("#draw")
        let canvas = document.createElement('canvas');
        canvas.width = 72;
        canvas.height = 72;

        let ctx = canvas.getContext('2d');
        ctxConsumer(canvas, ctx);

        $SD.api.setImage(this.context, canvas.toDataURL('image/png'));
    },
    autoFontSize: function (canvas, ctx, text, max = 30, min = 6) {
        let fontSize = 30;
        do {
            fontSize--;
            ctx.font = fontSize + 'px ' + (this.settings.font || 'system-ui');
        } while (fontSize > 6 && ctx.measureText(text).width > canvas.width);
    },
    render: function () {
        console.log("#render");
        let name = "???";
        let status = "???";
        if (Object.keys(this.runningBuilds).length <= 0) {
            name = "";
            status = "IDLE";

            if (this.backgroundColor !== 'black') {
                this.clearAndSetTimeout('backgroundReset', () => this.backgroundColor = 'black');
            }
        } else {
            //TODO: support multiple
            let build = this.runningBuilds[Object.keys(this.runningBuilds)[0]];
            console.log("build", build);
            if (build) {
                name = build.buildType.name;

                if (build.finishEstimate) {
                    let duration = moment.duration(moment(build.finishEstimate).diff(moment()))
                    status = "" + duration.seconds() + "s";
                } else if (build.percentageComplete) {
                    status = "" + build.percentageComplete + "%";
                } else {
                    status = build.state;
                }


                this.clearAndSetTimeout("render", () => this.render(), 1000);
            }
        }

        this.draw((canvas, ctx) => {
            ctx.fillStyle = this.backgroundColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';

            ctx.font = '14px ' + (this.settings.font || 'system-ui')
            this.autoFontSize(canvas, ctx, '' + name);
            ctx.fillText('' + name, canvas.width / 2, canvas.height * 0.2, canvas.width);

            ctx.font = '18px ' + (this.settings.font || 'system-ui');
            ctx.textBaseline = 'middle';
            this.autoFontSize(canvas, ctx, '' + status, 18);
            ctx.fillText('' + status, canvas.width / 2, canvas.height / 2, canvas.width);
        })

        // this.setTitle(title);
    },
    refreshRunningBuilds: function () {
        console.log("#refreshRunningBuilds")
        let stillRunning = 0;
        let finishedBuilds = [];
        let promises = [];
        for (let id in this.runningBuilds) {
            let runningBuild = this.runningBuilds[id];
            promises.push(this.getBuildById(runningBuild.id).then(build => {
                runningBuild = {...runningBuild, ...build};
                this.runningBuilds[id] = runningBuild;
                if (runningBuild.running) {
                    stillRunning++;
                } else {
                    finishedBuilds.push(id);
                }
            }));
        }

        console.log("runningBuilds", this.runningBuilds);
        console.log("stillRunning", stillRunning);

        Promise.all(promises).then(() => {
            if (Object.keys(this.runningBuilds).length > 0) {
                let build0 = this.runningBuilds[Object.keys(this.runningBuilds)[0]];

                if (stillRunning > 0) {
                    this.clearAndSetTimeout("runningRefresh", () => this.refreshRunningBuilds(), 2000);
                } else {
                    if (build0.status !== 'SUCCESS') {
                        this.backgroundColor = 'orange';
                    } else {
                        this.backgroundColor = 'green';
                    }
                }

                this.render();
            }


            // remove finished builds
            for (let id of finishedBuilds) {
                delete this.runningBuilds[id];
            }
        })
    },
    refreshAllBuilds: function () {
        console.log("#refreshAllBuilds")
        if (!this.currentUser) {
            this.refreshUser();
            return;
        }

        this.getBuilds().then(builds => {
            console.log("builds", builds);

            let changePromises = [];
            for (let build of builds) {
                if (!this.shouldIncludeBuild(build)) continue;
                if (build.triggered?.user?.id === this.currentUser.id) { // check manually triggered build
                    this.runningBuilds[build.id] = build;
                } else { // check changes for user
                    changePromises.push(this.apiRequest(build.changes.href + '&fields=change(user,id,version,username,date,href)')
                        .then(b => b.change)
                        .then(changes => {
                            console.log("change", changes);
                            return changes.filter(c => c.user.id === this.currentUser.id);
                        })
                        .then(changes => {
                            if (changes.length > 0) {
                                this.runningBuilds[build.id] = build;
                            }
                        }));
                }
            }

            Promise.all(changePromises).then(() => {
                console.log("runningBuilds", this.runningBuilds);

                this.render();

                if (Object.keys(this.runningBuilds).length > 0) {
                    this.clearAndSetTimeout("runningRefresh", () => this.refreshRunningBuilds(), 1000);
                }
            })
        })
    },
}
