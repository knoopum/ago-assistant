var app = {
    user: {},
    stats: {
        activities: {}
    },
};

function validateUrl(el) {
    // Check the url for errors (e.g. no trailing slash)
    // and update it before sending.
    "use strict";
    var portal = $.trim($(el).val()), // trim whitespace
        html = $("#urlErrorTemplate").html();
    if (portal === "") {
        // Default to ArcGIS Online.
        portal = "https://arcgis.com/";
    } else if (portal.search("/home/") > 0) {
        // Strip the /home endpoint.
        portal = portal.substr(0, portal.search("/home/")) + "/";
    } else if (portal.search("/sharing/") > 0) {
        // Strip the /home endpoint.
        portal = portal.substr(0, portal.search("/sharing/")) + "/";
    } else if (portal.charAt(portal.length - 1) !== "/") {
        // Add the trailing slash.
        portal = portal + "/"
    }
    $(el).val(portal);

    $.when(portalVersion(portal, function (response) {
        if (response === "error") {
            $(el).parent().after(html);
        } else {
            console.log("API v" + response);
        }
    }));
}

function loginSource() {
    $("#sourceLoginBtn").button("loading");
    $("#itemsArea").empty(); //Clear any old items.
    $.when(generateToken($("#sourceUrl").val(), $("#sourceUsername").val(), $("#sourcePassword").val(), function (response) {
        $("#sourceLoginBtn").button("reset");
        if (response.token) {
            // Store the portal info in the browser's sessionStorage.
            $.when(storeCredentials("source", $("#sourceUrl").val(), $("#sourceUsername").val(), response.token, function (callback) {
                startSession();
            }));
        } else if (response.error.code === 400) {
            var html = $("#loginErrorTemplate").html();
            $("#sourceLoginForm").before(html);
        } else {
            console.log("Unhandled error.");
            console.log(response);
        }
    }));
}

function startSession() {
    "use strict";
    var portal = sessionStorage["sourceUrl"],
        token = sessionStorage["sourceToken"];
    $.when(portalInfo(portal, token, function (info) {
        var template = $("#sessionTemplate").html(),
            html = Mustache.to_html(template, info);
        $("#sourceLoginForm").before(html);
        $("#sourceLoginForm").hide();
        $("#sourceLoginBtn").hide();
        $("#logout").show();
        $("#actionDropdown").css({
            "visibility": "visible"
        });
        listItems();
    }));
}

function storeCredentials(direction, portal, username, token, callback) {
    "use strict";
    sessionStorage[direction + "Token"] = token;
    sessionStorage[direction + "Url"] = portal;
    sessionStorage[direction + "Username"] = username;
    callback();
}

function loginDestination() {
    $("#destinationLoginBtn").button("loading");
    $("#dropArea").empty(); //Clear any old items.
    $.when(generateToken($("#destinationUrl").val(), $("#destinationUsername").val(), $("#destinationPassword").val(), function (response) {
        $("#destinationLoginBtn").button("reset");
        if (response.token) {
            $.when(storeCredentials("destination", $("#destinationUrl").val(), $("#destinationUsername").val(), response.token, function (callback) {
                $("#copyModal").modal("hide");
                $(".content").each(function (i) {
                    makeDraggable($(this)); //Make the content draggable.
                    $(this).css("max-width", $("#itemsArea .panel-body").width()); // Set the max-width so it doesn't fill the body when dragging.
                });
                cleanUp();
                showDestinationFolders();
            }));
        } else if (response.error.code === 400) {
            var html = $("#loginErrorTemplate").html();
            $("#destinationLoginForm").before(html);
        } else {
            console.log("Unhandled error.");
            console.log(response);
        }
    }));
}

function logout() {
    sessionStorage.clear();
    $("#itemsArea").empty(); //Clear any old items.
    $("#dropArea").empty(); //Clear any old items.
    $("#sessionDropdown").remove();
    $("#loginSuccess").remove();
    $("#actionDropdown").css({
        "visibility": "hidden"
    });
    $("#sourceLoginForm").show();
    $("#sourceLoginBtn").show();
}

function inspectContent() {
    $(".content").addClass("data-toggle");
    $(".content").removeClass("disabled");
    $(".content").attr("data-toggle", "button");

    $("#inspectModal").modal("hide");
    $("#inspectBtn").button("reset");
    // Add a listener for clicking on content buttons.
    $(".content").click(function () {
        $(".content").removeClass("active");
        $(".content").removeClass("btn-primary");
        $(this).addClass("btn-primary");
        var id = $(this).attr("data-id"),
            title = $(this).text();
        $.when(itemDescription(sessionStorage["sourceUrl"], id, sessionStorage["sourceToken"], function (description) {
            var descriptionString = JSON.stringify(description, undefined, 4);
            $.when(itemData(sessionStorage["sourceUrl"], id, sessionStorage["sourceToken"], function (data) {
                var dataString = JSON.stringify(data, undefined, 4);
                var templateData = {
                    title: title,
                    description: descriptionString,
                    data: dataString
                }
                var html = Mustache.to_html($("#inspectTemplate").html(), templateData);
                // Add the HTML container with the item JSON.
                $("#dropArea").html(html);
            }));
        }));
    });
}

function viewStats() {
    $.when(userProfile(sessionStorage["sourceUrl"], sessionStorage["sourceUsername"], sessionStorage["sourceToken"], function (user) {

        var template = $("#statsTemplate").html();
        var thumbnailUrl;
        // Check that the user has a thumbnail image.
        if (user.thumbnail) {
            thumbnailUrl = sessionStorage["sourceUrl"] + "sharing/rest/community/users/" + user.username + "/info/" + user.thumbnail + "?token=" + sessionStorage["sourceToken"];
        } else {
            thumbnailUrl = "assets/images/no-user-thumb.jpg";
        }
        var data = {
            username: user.username,
            thumbnail: thumbnailUrl
        }
        html = Mustache.to_html(template, data);
        $("body").append(html);
        statsCalendar(app.stats.activities);

        $("#statsModal").modal("show");

        $("#statsModal").on("shown", function () {
            // Apply CSS to style the calendar arrows.
            var calHeight = $(".calContainer").height();
            $(".calArrow").css("margin-top", (calHeight - 20) + "px");
        });

        $("#statsModal").on("hidden", function () {
            // Destroy the stats modal so it can be properly rendered next time.
            $("#statsModal").remove();
        });

    }));
}

function makeDraggable(el) {
    el.draggable({
        cancel: false,
        helper: "clone",
        appendTo: "body",
        revert: "invalid",
        opacity: 0.7
    });
    el.removeClass("disabled");
}

function makeDroppable(id) {
    // Make the drop area accept content items.
    $("#dropFolder_" + id).droppable({
        accept: ".content",
        activeClass: "ui-state-hover",
        hoverClass: "ui-state-active",
        drop: function (event, ui) {
            moveItem(ui.draggable, $(this).parent().parent());
        }
    });
}

function cleanUp() {
    $("#dropArea").empty(); //Clear any old items.
    $(".content").unbind("click"); // Remove old event handlers.
    $(".content").removeClass("active");
    $(".content").removeClass("btn-primary");
}

function isSupported(type) {
    // Check if the content type is supported.
    // List of types available here: http://resources.arcgis.com/en/help/arcgis-rest-api/index.html#//02r3000000ms000000
    var supportedTypes = ["Web Map", "Map Service", "Image Service", "WMS", "Feature Collection", "Feature Collection Template",
                          "Geodata Service", "Globe Service", "Geometry Service", "Geocoding Service", "Network Analysis Service",
                          "Geoprocessing Service", "Web Mapping Application", "Mobile Application", "Operation View", "Symbol Set",
                          "Color Set", "Document Link"];
    if ($.inArray(type, supportedTypes) > -1) {
        return true;
    }
}

function statsCalendar(activities) {

    // Create a date object for three months ago.
    var today = new Date();
    var startDate = new Date();
    startDate.setMonth(today.getMonth() - 2);
    if (today.getMonth() < 2) {
        startDate.setYear(today.getYear() - 1);
    }

    var cal = new CalHeatMap();
    cal.init({
        itemSelector: "#statsCalendar",
        domain: "month",
        subDomain: "day",
        data: activities,
        start: startDate,
        cellSize: 10,
        domainGutter: 10,
        range: 3,
        legend: [1, 2, 5, 10],
        displayLegend: false,
        itemNamespace: "cal",
        previousSelector: "#calPrev",
        nextSelector: "#calNext",
        domainLabelFormat: "%b '%y",
        subDomainTitleFormat: {
            empty: "No activity on {date}",
            filled: "Saved {count} {name} {connector} {date}"
        },
        domainDynamicDimension: false
    });

}

function storeActivity(activityTime) {
    seconds = activityTime / 1000;
    app.stats.activities[seconds] = 1;
}

function listItems() {
    "use strict";
    var url = sessionStorage["sourceUrl"],
        username = sessionStorage["sourceUsername"],
        token = sessionStorage["sourceToken"];

    $.when(userContent(url, username, token, "/", function (content) {
        // Append the root folder accordion.
        var folderData = {
            title: "Root",
            id: "",
            count: content.items.length
        };
        var html = Mustache.to_html($("#folderTemplate").html(), folderData)
        $("#itemsArea").append(html);
        // Append the root items to the Root folder.
        $.each(content.items, function (item) {
            var html = Mustache.to_html($("#contentTemplate").html(), content.items[item]);
            $("#collapse_").append(html);
            storeActivity(content.items[item].modified);
        });
        $.each(content.folders, function (folder) {
            $.when(userContent(url, username, token, content.folders[folder].id, function (content) {
                var folderData = {
                    title: content.currentFolder.title,
                    id: content.currentFolder.id,
                    count: content.items.length
                };
                // Append an accordion for the folder.
                var html = Mustache.to_html($("#folderTemplate").html(), folderData)
                $("#itemsArea").append(html);
                // Append the items to the folder.
                $.each(content.items, function (item) {
                    var html = Mustache.to_html($("#contentTemplate").html(), content.items[item]);
                    $("#collapse_" + content.currentFolder.id).append(html);
                    storeActivity(content.items[item].modified);
                });
                // Collapse the accordion to avoid cluttering the display.
                $("#collapse_" + content.currentFolder.id).collapse("hide");
            }));
        });
    }));
}

function showDestinationFolders(url, token) {
    "use strict";
    var url = sessionStorage["destinationUrl"],
        username = sessionStorage["destinationUsername"],
        token = sessionStorage["destinationToken"];

    $.when(userContent(url, username, token, "/", function (content) {
        var folderData = {
            title: "Root",
            id: "",
            count: content.items.length
        };
        // Append the root folder accordion.
        var html = Mustache.to_html($("#dropFolderTemplate").html(), folderData)
        $("#dropArea").append(html);
        makeDroppable(""); // Enable the droppable area.
        // Append the other folders.
        $.each(content.folders, function (folder) {
            $.when(userContent(url, username, token, content.folders[folder].id, function (content) {
                var folderData = {
                    title: content.currentFolder.title,
                    id: content.currentFolder.id,
                    count: content.items.length
                };
                // Append an accordion for the folder.
                var html = Mustache.to_html($("#dropFolderTemplate").html(), folderData)
                $("#dropArea").append(html);
                // Collapse the accordion to avoid cluttering the display.
                $("#collapse" + content.currentFolder.id).collapse("hide");
                makeDroppable(content.currentFolder.id); // Enable the droppable area.
            }));
        });
    }));
}

function moveItem(item, destination) {
    // Move the content DOM element from the source to the destination container on the page.
    "use strict";
    $(item).css("max-width", ""); // Remove the max-width property so it fills the folder.
    item.prependTo(destination);
    var itemId = $(item).attr("data-id");
    var destinationFolder = $(item).parent().attr("data-folder");
    copyItem(itemId, destinationFolder);
}

function copyItem(id, folder) {
    // id: id of the source item
    // folder: id of the destination folder
    "use strict";
    var sourcePortal = sessionStorage["sourceUrl"],
        sourceToken = sessionStorage["sourceToken"],
        destinationPortal = sessionStorage["destinationUrl"],
        destinationUsername = sessionStorage["destinationUsername"],
        destinationToken = sessionStorage["destinationToken"];

    var type = $("#" + id).attr("data-type");
    // Ensure the content type is supported before trying to copy it.
    if (isSupported(type)) {
        // Get the full item description and data from the source.
        $.when(itemDescription(sourcePortal, id, sourceToken, function (description) {
            var thumbnailUrl = sourcePortal + "sharing/rest/content/items/" + id + "/info/" + description.thumbnail + "?token=" + sourceToken;
            $.when(itemData(sourcePortal, id, sourceToken, function (data) {
                // Replace response object for items with no data component.
                if (data.responseText === "") {
                    data = "";
                }
                // Post it to the destination.
                $.when(addItem(destinationPortal, destinationUsername, folder, destinationToken, description, data, thumbnailUrl, function (response) {
                    if (response.success === true) {
                        $("#" + id).addClass("btn-success");
                    } else if (response.error) {
                        $("#" + id).addClass("btn-danger");
                        var message = response.error.message
                        var html = Mustache.to_html($("#contentCopyErrorTemplate").html(), {
                            id: id,
                            message: message
                        });
                        $("#" + id).before(html);
                    } else {
                        var message = "Something went wrong."
                        var html = Mustache.to_html($("#contentCopyErrorTemplate").html(), {
                            id: id,
                            message: message
                        });
                        $("#" + id).before(html);
                    }
                }));
            }));
        }));
    } else {
        // Not supported.
        $("#" + id).addClass("btn-warning");
        var html = Mustache.to_html($("#contentTypeErrorTemplate").html(), {
            id: id,
            type: type
        });
        $("#" + id).before(html);
        $("#" + id + "_alert").fadeOut(6000);
    }
}