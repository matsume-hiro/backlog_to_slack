'use strict'
const _ = require('lodash')
const Slack = require('slack-node')
const request = require('request-promise-native')
const backlogConst = require('./backlogConst')

const slack = new Slack(process.env.SLACK_API_TOKEN)

exports.apiController = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(400).send('uri not allowed')
    }

    const backlog = req.body
    if (!backlog || !backlog.id) {
        console.error('cannot parse body:', req.body)
        return res.status(400).send('invalid body')
    }

    console.log(`Start ${backlog.project.projectKey}-${backlog.content.key_id}`)

    let slackUsers = []
    let backlogUsers = []

    try {
        [slackUsers, backlogUsers] = await Promise.all([
            fetchSlackUsers(),
            fetchBacklogUsers(backlog.project.projectKey)
        ]);
    } catch(error) {
        console.error(error);
        return res.status(400).send('cannot fetch users');
    }


    const users = []
    if (backlog.content.assignee &&
        (!backlog.createdUser || backlog.createdUser.id !== backlog.content.assignee.id) &&
        (!backlog.updatedUser || backlog.updatedUser.id !== backlog.content.assignee.id)) {
        // find backlog user
        const backlogUser = _.find(backlogUsers, { id: backlog.content.assignee.id })
        // find slack user by slack user's email
        const slackUser = _.find(slackUsers.members, o => o.profile.email === backlogUser.mailAddress)
        if (slackUser) {
            users.push(slackUser.name)
        }
    }

    for (const notification of backlog.notifications) {
        // find backlog user
        const backlogUser = _.find(backlogUsers, { id: notification.user.id })
        if (!backlogUser) {
            continue
        }
        // find slack user by slack user's email
        const slackUser = _.find(slackUsers.members, o => o.profile.email === backlogUser.mailAddress)
        if (!slackUser) {
            continue
        }
        if (!users.includes(slackUser.name)) {
            users.push(slackUser.name)
        }
    }

    const issue = await fetchBacklogIssue(backlog.project.projectKey, backlog.content.key_id)

    const channelId = req.query['channelId']

    console.log(`Start message post to ${users.join(',')}`)
    const message = generateChatMessage(backlog, issue, users)
    try {
        await postChatMessage(message, channelId)
        return res.status(200).send('OK')
    } catch (err) {
        return res.status(500).send(err)
    }
}

/**
 * fetch backlog issue
 * @param projectKey
 * @param issueKey
 */
const fetchBacklogIssue = (projectKey, issueKey) =>
    request({
        uri: `${process.env.BACKLOG_BASE_URL}/api/v2/issues/${projectKey}-${issueKey}`,
        qs: {
            apiKey: process.env.BACKLOG_API_KEY
        },
        json: true
    })

/**
 * fetch backlog user list
 * @param projectKey
 */
const fetchBacklogUsers = projectKey =>
    request({
        uri: `${process.env.BACKLOG_BASE_URL}/api/v2/projects/${projectKey}/users`,
        qs: {
            apiKey: process.env.BACKLOG_API_KEY
        },
        json: true
    })

/**
 * fetch slack user list
 */
const fetchSlackUsers = () =>
    new Promise((resolve, reject) => {
        slack.api('users.list', (err, response) => {
            if (err || !response.ok) {
                console.error(err)
                reject(err)
            } else {
                resolve(response)
            }
        })
    })

/**
 * generate message payload for slack
 * @param backlogMessage
 * @param backlogIssue
 * @returns {{as_user: boolean, attachments}}
 */
const generateChatMessage = (backlogMessage, backlogIssue, users) => {
    const backlogKey = `${backlogMessage.project.projectKey}-${backlogMessage.content.key_id}`
    const fields = [
        {
            value: `*状態*: ${backlogIssue.status.name}`,
            short: true
        },
        {
            value: `*優先度*: ${backlogIssue.priority.name}`,
            short: true
        }
    ]

    if (backlogIssue.assignee) {
        fields.push({
            value: `*担当者*: ${backlogIssue.assignee.name}`,
            short: true
        })
    }

    if (backlogIssue.updatedUser) {
        fields.push({
            value: `*更新者*: ${backlogIssue.updatedUser.name}`,
            short: true
        })
    }

    if (backlogMessage.type == 1 && backlogMessage.content.description) {
        fields.push({
            title: '詳細',
            value: backlogMessage.content.description.replace('\n', ' '),
            short: false
        })
    }

    if (backlogMessage.content.comment) {
        fields.push({
            title: 'コメント',
            value: backlogMessage.content.comment.content.replace('\n', ' '),
            short: false
        })
    }

    let usermention = ''

    if (users.length > 0) {
        usermention = `<@${users.join('> <@')}>\n`
    }

    return {
        as_user: true,
        attachments: JSON.stringify([
            {
                fallback: `Backlog - ${backlogConst.types[backlogMessage.type]}: ${backlogKey} ${backlogMessage.content.summary}`,
                color: backlogConst.statusColors[backlogIssue.status.id],
                pretext: `${usermention}Backlog - ${backlogConst.types[backlogMessage.type]}`,
                text: `【${backlogIssue.issueType.name}】<${process.env.BACKLOG_BASE_URL}/view/${backlogKey}|${backlogKey}> ${backlogMessage.content.summary}`,
                mrkdwn_in: ['pretext', 'text', 'fields'],
                fields: fields
            }
        ])
    }
}

/**
 * post message to slack
 * @param message
 * @param users
 * @returns {Promise.<*[]>}
 */
const postChatMessage = (message, channel) => {
    const promises = []
    const payload = _.extend({}, message, { channel: channel })
    console.log(payload)
    promises.push(new Promise((resolve, reject) => {
        slack.api('chat.postMessage', payload, (err, response) => {
            console.log(response)
            if (err) {
                console.error(err)
                reject(err)
            } else {
                resolve(response)
            }
        })
    }))
    return Promise.all(promises)
}
