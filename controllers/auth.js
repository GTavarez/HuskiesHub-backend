const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/auth.js");
const { JWT_SECRET } = require("../utils/config.js");

const signup = async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  console.log("Request body:", req.body);
  return bcrypt
    .hash(password, 10)
    .then((hashedPassword) => {
      return User.create({
        name,
        email,
        password: hashedPassword,
        confirmPassword: hashedPassword,
      });
    })
    .then((user) => {
      res.status(201).send({
        user: {
          name: user.name,
          email: user.email,
          _id: user._id,
        },
      });
    })
    .catch((error) => {
      console.error(error);
      if (error.code === 11000) {
        res.status(409).send({ message: "Email already in use" });
      } else {
        res.status(500).send({ message: "server failed" });
      }
    });
};
const getCurrentUser = (req, res) => {
  const { _id: userId } = req.user;
  return User.findById(userId)
    .orFail()
    .then((user) => {
      res.status(200).send({
        user: {
          name: user.name,
          email: user.email,
          _id: user._id,
        },
      });
    })

    .catch((error) => {
      res.status(500).send({ message: error.message });
    });
};
const signin = (req, res) => {
  const { email, password } = req.body;
  return User.findUserByCredentials(email, password)
    .then((user) => {
      const token = jwt.sign({ _id: user._id }, JWT_SECRET, {
        expiresIn: "7d",
      });
      res.status(200).send({ token });
    })
    .catch((error) => {
      res.status(401).send({ message: error.message });
    });
};

module.exports = {
  signup,
  signin,
  getCurrentUser,
};
