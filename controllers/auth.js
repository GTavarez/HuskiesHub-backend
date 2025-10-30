const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/auth.js");
const { JWT_SECRET } = require("../utils/config.js");

/* const signup = async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;

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
      const token = jwt.sign({ _id: user._id }, JWT_SECRET, {
        expiresIn: "7d",
      });
      res.status(201).send({
        token,
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
}; */
const signup = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).send({ message: "Missing required fields" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      confirmPassword: hashedPassword,
    });

    // Generate JWT
    const token = jwt.sign({ _id: user._id }, JWT_SECRET, { expiresIn: "7d" });

    // Send response
    res.status(201).send({
      token,
      user: { _id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).send({ message: "Internal server error" });
  }
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
      console.log(user);
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
