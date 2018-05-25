const Raven = require('raven')
const GoogleStrategy = require('passport-google-oauth2').Strategy

const models = require('../../../db/models').models

const config = require('../../../../config')
const secrets = config.SECRETS
const passutils = require('../../../utils/password')

module.exports = new GoogleStrategy({
        clientID: secrets.GOOGLE_CLIENT_ID,
        clientSecret: secrets.GOOGLE_CLIENT_SECRET,
        callbackURL: config.SERVER_URL + config.GOOGLE_CALLBACK,
        passReqToCallback: true,
        scope: 'https://www.googleapis.com/auth/plus.login'
    }, function (req, accessToken, refreshToken, profile, cb) {
        let profileJson = profile._json
        let oldUser = req.user
        Raven.setContext({extra: {file: 'googlestrategy'}})
        if (oldUser) {
            if (config.DEBUG) console.log('User exists, is connecting Google account')
            models.UserGoogle.findOne({where: {id: profileJson.id}})
                .then((glaccount) => {
                    if (glaccount) {
                        throw new Error('Your Google account is already linked with codingblocks account Id: ' + glaccount.dataValues.userId)
                    } else {
                        models.UserGoogle.upsert({
                            id: profileJson.id,
                            accessToken: accessToken,
                            refreshToken: refreshToken,
                            userId: oldUser.id
                        })
                            .then(function (updated) {
                                return models.User.findById(oldUser.id)
                            })
                            .then(function (user) {
                                return cb(null, user.get())
                            })
                            .catch((err) => Raven.captureException(err))
                    }
                })
                .catch((err) => {
                    cb(null, false, {message: err.message})
                })
        } else {
            models.User.count({where: {username: profileJson.login}})
                .then(function (existCount) {

                    return models.UserGoogle.findCreateFind({
                        include: [models.User],
                        where: {id: profileJson.id},
                        defaults: {
                            id: profileJson.id,
                            accessToken: accessToken,
                            refreshToken: refreshToken,
                            user: {
                                username: profileJson.displayName,
                                firstname: profileJson.name.givenName,
                                lastname: profileJson.name.familyName,
                                photo: profileJson.image.url
                            }
                        }
                    })
                }).spread(function (userGoogle, created) {
                if (!userGoogle) {
                    return cb(null, false, {message: 'Authentication Failed'})
                }
                return cb(null, userGoogle.user.get())
            }).catch((err) => {
                Raven.captureException(err)
            })
        }
    }
)