/* global $CC, Utils, $SD */

$SD.on('connected', json => {
    $SD.on('org.inventivetalent.teamcity.action.willAppear', (jsonObj) => action.onWillAppear(jsonObj));
    $SD.on('org.inventivetalent.teamcity.action.willDisappear', (jsonObj) => action.onWillDisappear(jsonObj));
    $SD.on('org.inventivetalent.teamcity.action.keyDown', (jsonObj) => action.onKeyDown(jsonObj));
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

const tcBuildFields = "href,webUrl,user,id,status,state,finishEstimate,changes,startDate,queuedDate,finishDate,running,branchName,percentageComplete,triggered(user),buildType";

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

        this.render();
    },
    onWillAppear: function (json) {
        console.log('onWillAppear', json);
        this.context = json.context;
        this.settings = json.payload.settings;

        this.refreshUser().then(() => {
            if (!this.currentUser) return;

            this.clearAndSetInterval('allRefresh', () => this.refreshAllBuilds(), 6000 + Math.random() * 100);
            this.refreshAllBuilds();
        });

    },
    onWillDisappear: function (json) {
        console.log('onWillDisappear', json);
        for (let k in this.timers) {
            clearInterval(this.timers[k]);
            clearTimeout(this.timers[k]);
            delete this.timers[k];
            delete this.backgroundImage;
        }
    },
    onKeyDown: function (json) {
        console.log('onKeyDown', json);

        this.refreshUser().then(() => {
            if (!this.currentUser) return;

            this.clearAndSetInterval('allRefresh', () => this.refreshAllBuilds(), 6000 + Math.random() * 100);
            this.refreshAllBuilds();
        });
    },
    onKeyUp: function (json) {
        console.log('onKeyUp', json);
        if (Object.keys(this.runningBuilds).length > 0) {
            let build0 = this.runningBuilds[Object.keys(this.runningBuilds)[0]];
            if (build0.webUrl) {
                $SD.api.openUrl(this.context, build0.webUrl);
            }
        }
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
        let expected = Date.now() + time;
        let wrapper = () => {
            if (Date.now() > expected) {
                console.warn('timeout ' + key + ' is late by ' + (Date.now() - expected) + 'ms');
            }
            fun();
        };
        this.timers[key] = setTimeout(wrapper, time);
    },
    clearAndSetInterval(key, fun, time) {
        clearInterval(this.timers[key]);
        this.timers[key] = setInterval(fun, time);
    },
    apiRequest: function (query) {
        let url = new URL(query, this.settings.host);
        console.info(url.href);
        return fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.settings.token}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'User-Agent': 'streamdeck-teamcity (+https://github.com/InventivetalentDev/streamdeck-teamcity)',
                'X-User-Agent': 'streamdeck-teamcity (+https://github.com/InventivetalentDev/streamdeck-teamcity)'
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
        return this.apiRequest(`/app/rest/builds?locator=running:true&fields=build(${tcBuildFields})`).then(b => b.build);
    },
    refreshUser: function () {
        console.log("#refreshUser")
        return this.getCurrentUser().then(currentUser => {
            this.currentUser = currentUser;
        })
    },
    getBuildById: function (id) {
        return this.apiRequest(`/app/rest/builds?locator=id:${id}&fields=build(${tcBuildFields})`).then(b => b.build[0]);
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
        let fontSize = max;
        do {
            fontSize--;
            ctx.font = fontSize + 'px ' + (this.settings.font || 'system-ui');
        } while (fontSize > min && ctx.measureText(text).width > canvas.width - 4);
    },
    render: function () {
        console.log("#render");
        let name = "???";
        let status = "???";
        let branch = "???"
        let progress = 0;
        if (Object.keys(this.runningBuilds).length <= 0) {
            name = "";
            status = "IDLE";
            branch = "";

            if (this.backgroundColor !== 'black') {
                this.clearAndSetTimeout('backgroundReset', () => this.backgroundColor = 'black');
            }
        } else {
            // find build with most progress
            let build = Object.values(this.runningBuilds)
                .sort((a, b) => {
                    if (a.running && !b.running) return -1;
                    if (!a.running && b.running) return 1;
                    if (a.percentageComplete > b.percentageComplete) return -1;
                    if (a.percentageComplete < b.percentageComplete) return 1;
                    return 0;
                })[0];
            console.log("build", build);
            if (build) {

                name = build.buildType.name;
                branch = build.branchName || "";

                if (!build.running) {
                    status = build.state;
                } else if (build.finishEstimate) {
                    let duration = moment.duration(moment(build.finishEstimate).diff(moment()))
                    status = "" + duration.seconds() + "s";
                } else if (build.percentageComplete) {
                    if (!build.estimatedPercentageComplete || build.percentageComplete > build.estimatedPercentageComplete) {
                        build.estimatedPercentageComplete = build.percentageComplete;
                    }
                    if (build.percentPerSecond && build.estimatedPercentageComplete < build.percentageComplete + 5) {
                        build.estimatedPercentageComplete += build.percentPerSecond / 2;
                    }
                    if (build.estimatedPercentageComplete > 100) {
                        build.estimatedPercentageComplete = 100;
                    }

                    status = "" + Math.round(build.estimatedPercentageComplete) + "%";

                    progress = build.estimatedPercentageComplete;
                } else {
                    status = build.state;
                }


                this.clearAndSetTimeout("render", () => this.render(), 500);
            }
        }

        this.draw((canvas, ctx) => {
            ctx.fillStyle = this.backgroundColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (this.backgroundColor !== 'black') { // dynamic color for status
                ctx.fillStyle = this.backgroundColor;
            } else if (this.settings.background === 'gradient') { // gradient default bg
                let gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
                gradient.addColorStop(0, '#6b57ff');
                gradient.addColorStop(0.3, '#3dea62');
                gradient.addColorStop(1, '#07c3f2');

                ctx.fillStyle = gradient;
            } else { // solid color bg
                ctx.fillStyle = this.backgroundColor;
            }
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            if (progress > 0) {
                ctx.fillStyle = 'rgba(0,192,0,0.5)';
                ctx.fillRect(0, 0, canvas.width * progress / 100, canvas.height);
                // ctx.fillRect(0, canvas.height - 8, canvas.width * progress / 100, 5);
            }

            ctx.shadowBlur = 3;
            ctx.shadowColor = 'black';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';

            ctx.font = '14px ' + (this.settings.font || 'system-ui')
            this.autoFontSize(canvas, ctx, '' + name, 16);
            ctx.fillText('' + name, canvas.width / 2, canvas.height * 0.3, canvas.width);

            ctx.font = '12px ' + (this.settings.font || 'system-ui')
            this.autoFontSize(canvas, ctx, '' + branch, 14);
            ctx.fillText('' + branch, canvas.width / 2, canvas.height * 0.5, canvas.width);

            ctx.font = '18px ' + (this.settings.font || 'system-ui');
            ctx.textBaseline = 'middle';
            this.autoFontSize(canvas, ctx, '' + status, 20);
            ctx.fillText('' + status, canvas.width / 2, canvas.height * 0.7, canvas.width);
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
                runningBuild = {...{}, ...runningBuild, ...build};

                if (!runningBuild.lastPercentageComplete) {
                    runningBuild.lastPercentageComplete = runningBuild.percentageComplete;
                    runningBuild.lastRefresh = Date.now();
                }

                let lastPercentPerSecond = runningBuild.percentPerSecond;
                runningBuild.percentPerSecond = (runningBuild.percentageComplete - runningBuild.lastPercentageComplete) / ((Date.now() - runningBuild.lastRefresh) / 1000);
                if (lastPercentPerSecond) {
                    runningBuild.percentPerSecond = (runningBuild.percentPerSecond + lastPercentPerSecond) / 2;
                }

                runningBuild.lastRefresh = Date.now();
                runningBuild.lastPercentageComplete = runningBuild.percentageComplete;

                this.runningBuilds[id] = runningBuild;
                if (runningBuild.running) {
                    stillRunning++;
                } else {
                    finishedBuilds.push(id);
                }
            }));
        }


        Promise.all(promises).then(() => {
            console.log("runningBuilds", this.runningBuilds);
            console.log("stillRunning", stillRunning);

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


            this.clearAndSetTimeout('finishedBuildCleanup', () => {
                // remove finished builds
                for (let id of finishedBuilds) {
                    delete this.runningBuilds[id];
                }
            }, 3000);
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
                    let oldBuild = this.runningBuilds[build.id] || {};
                    this.runningBuilds[build.id] = {...{}, ...oldBuild, ...build};
                } else { // check changes for user
                    changePromises.push(this.apiRequest(build.changes.href + '&fields=change(user,id,version,username,date,href)')
                        .then(b => b.change)
                        .then(changes => {
                            console.log("change", changes);
                            return changes.filter(c => c.user?.id === this.currentUser.id);
                        })
                        .then(changes => {
                            if (changes.length > 0) {
                                let oldBuild = this.runningBuilds[build.id] || {};
                                this.runningBuilds[build.id] = {...{}, ...oldBuild, ...build};
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
