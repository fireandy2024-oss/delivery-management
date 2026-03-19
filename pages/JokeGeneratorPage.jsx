import React from 'react';
import JokeGenerator from './JokeGenerator';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';

const JokeGeneratorPage = () => {
    return (
        <Router>
            <Switch>
                <Route path="/joke-generator">
                    <JokeGenerator />
                </Route>
            </Switch>
        </Router>
    );
};

export default JokeGeneratorPage;